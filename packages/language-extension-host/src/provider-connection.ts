import type { ExactLanguageExtensionRole, ExactLanguageExtensionsConfig } from '@exactjs/config';
import {
	exactLanguageProtocolLimits,
	type ExactLanguageAnalyzerCapability,
	type ExactLanguageAnalyzerContext,
	type ExactLanguageJsonValue
} from '@exactjs/language-extension-api';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ExactLanguageProviderDescriptor, ExactLanguageProviderStatus } from './contracts.js';
import type { ExactLanguageRunnerResponse } from './runner-protocol.js';
import { readBoundedLines } from './bounded-lines.js';

/** Workspace inputs used to initialize an isolated language-provider process. */
export type ProviderConnectionOptions = Readonly<{
	workspaceRoot: string;
	locale?: string;
	config?: ExactLanguageExtensionsConfig;
}>;

/** Owns one bounded child-process connection to a trusted language provider. */
export class ProviderConnection {
	private process: ChildProcessWithoutNullStreams | undefined;
	private nextId = 1;
	private readonly pending = new Map<
		number,
		Readonly<{ resolve(value: unknown): void; reject(error: Error): void }>
	>();
	private health: ExactLanguageProviderStatus['health'] = 'idle';
	private generation = 0;
	private lastDurationMs: number | undefined;
	private message: string | undefined;
	private initialize: Promise<void> | undefined;
	private readonly failures: number[] = [];
	private disposed = false;
	private readonly lifetime = new AbortController();
	private stopOutput: (() => void) | undefined;

	constructor(
		readonly descriptor: ExactLanguageProviderDescriptor,
		private readonly options: ProviderConnectionOptions,
		private readonly configuration: ExactLanguageJsonValue | undefined
	) {}

	/** Executes a provider capability with cancellation, timeout, and health accounting. */
	async request<T>(
		method: ExactLanguageAnalyzerCapability,
		params: unknown,
		timeoutMs: number,
		signal?: AbortSignal,
		hardFailure = true
	): Promise<T> {
		if (this.health === 'quarantined')
			throw new Error(`Language provider ${this.descriptor.id} is quarantined`);
		await this.ensureStarted(signal);
		const start = performance.now();
		try {
			const result = await this.send(method, params, timeoutMs, signal);
			this.health = 'ready';
			this.generation++;
			this.lastDurationMs = performance.now() - start;
			this.message = undefined;
			return result as T;
		} catch (error) {
			if (hardFailure && !this.failureRecorded()) {
				this.recordFailure();
				this.message = error instanceof Error ? error.message : String(error);
			}
			throw error;
		}
	}

	/** Returns an immutable snapshot of provider provenance and process health. */
	status(): ExactLanguageProviderStatus {
		return Object.freeze({
			id: this.descriptor.id,
			version: this.descriptor.version,
			trust: this.descriptor.trust,
			capabilities: this.descriptor.capabilities,
			...providerStatusProvenance(this.descriptor, this.options.config),
			health: this.health,
			generation: this.generation,
			...(this.lastDurationMs === undefined ? {} : { lastDurationMs: this.lastDurationMs }),
			...(this.message ? { message: this.message } : {})
		});
	}

	/** Records a host-side validation failure against this provider. */
	rejectResult(error: unknown): void {
		if (this.health !== 'failed' && this.health !== 'quarantined') this.recordFailure();
		this.message = error instanceof Error ? error.message : String(error);
	}

	/** Gracefully shuts down the provider and rejects outstanding requests. */
	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.lifetime.abort(new Error('Language provider disposed'));
		const child = this.process;
		if (!child) {
			await this.initialize?.catch(() => undefined);
			return;
		}
		try {
			await this.send(
				'shutdown' as never,
				undefined,
				exactLanguageProtocolLimits.shutdownMilliseconds
			);
		} catch {}
		this.process = undefined;
		this.stopOutput?.();
		this.stopOutput = undefined;
		if (!child.killed) child.kill();
		for (const pending of this.pending.values())
			pending.reject(new Error('Language provider disposed'));
		this.pending.clear();
	}

	private async ensureStarted(signal?: AbortSignal): Promise<void> {
		if (this.disposed) throw new Error('Language provider disposed');
		if (this.initialize) return this.initialize;
		this.initialize = this.start(signal).catch((error) => {
			this.initialize = undefined;
			throw error;
		});
		return this.initialize;
	}

	private async start(signal?: AbortSignal): Promise<void> {
		const startupSignal = AbortSignal.any(
			[signal, this.lifetime.signal].filter((value): value is AbortSignal => value !== undefined)
		);
		throwIfAborted(startupSignal);
		if (this.failures.length) {
			const delays = [250, 1_000, 4_000] as const;
			await abortableDelay(
				delays[Math.min(this.failures.length - 1, delays.length - 1)]!,
				startupSignal
			);
		}
		throwIfAborted(startupSignal);
		const adjacentRunner = fileURLToPath(new URL('./runner.js', import.meta.url));
		const runner = existsSync(adjacentRunner)
			? adjacentRunner
			: fileURLToPath(new URL('../dist/runner.js', import.meta.url));
		const child = spawn(
			process.execPath,
			[`--max-old-space-size=${exactLanguageProtocolLimits.runnerOldSpaceMegabytes}`, runner],
			{ cwd: this.descriptor.packageRoot, stdio: ['pipe', 'pipe', 'pipe'] }
		);
		this.process = child;
		if (this.disposed) {
			this.process = undefined;
			child.kill();
			throw new Error('Language provider disposed');
		}
		child.stdin.on('error', (error) => this.childFailure(child, error));
		this.stopOutput = readBoundedLines(
			child.stdout,
			exactLanguageProtocolLimits.responseBytes,
			(line) => this.receive(child, line),
			(error) => this.childFailure(child, error)
		);
		let stderr = '';
		child.stderr.on('data', (chunk: Buffer) => {
			const remaining = 64 * 1024 - Buffer.byteLength(stderr);
			if (remaining > 0) stderr += chunk.subarray(0, remaining).toString('utf8');
		});
		child.once('exit', (code) => {
			this.childFailure(
				child,
				new Error(
					`Language provider ${this.descriptor.id} exited with ${code ?? 'no status'}${stderr ? `: ${stderr.trim()}` : ''}`
				)
			);
		});
		const context: ExactLanguageAnalyzerContext = Object.freeze({
			protocol: '1.0.0',
			provider: Object.freeze({
				name: this.descriptor.id,
				version: this.descriptor.version,
				...(this.descriptor.integrity ? { integrity: this.descriptor.integrity } : {})
			}),
			packageRoot: this.descriptor.packageRoot,
			workspace: Object.freeze({
				root: this.options.workspaceRoot,
				...(this.options.locale ? { locale: this.options.locale } : {})
			}),
			capabilities: this.descriptor.capabilities,
			...(this.configuration === undefined ? {} : { configuration: this.configuration }),
			dataFiles: this.descriptor.dataFiles
		});
		await this.sendFrame(
			'initialize',
			{ entry: this.descriptor.entry!, context },
			exactLanguageProtocolLimits.initializationMilliseconds,
			startupSignal
		);
		this.health = 'ready';
	}

	private send(
		method: string,
		params: unknown,
		timeoutMs: number,
		signal?: AbortSignal
	): Promise<unknown> {
		return this.sendFrame(method, { params }, timeoutMs, signal);
	}

	private sendFrame(
		method: string,
		fields: Record<string, unknown>,
		timeoutMs: number,
		signal?: AbortSignal
	): Promise<unknown> {
		const child = this.process;
		if (!child)
			return Promise.reject(new Error(`Language provider ${this.descriptor.id} is not running`));
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				this.writeFrame(child, { protocol: 1, method: 'cancel', requestId: id });
				reject(
					new Error(`Language provider ${this.descriptor.id} timed out after ${timeoutMs} ms`)
				);
				setTimeout(() => {
					if (this.process === child && !child.killed) child.kill();
				}, exactLanguageProtocolLimits.cancellationGraceMilliseconds).unref();
			}, timeoutMs);
			const abort = (): void => {
				clearTimeout(timer);
				this.pending.delete(id);
				this.writeFrame(child, { protocol: 1, method: 'cancel', requestId: id });
				reject(
					signal?.reason instanceof Error ? signal.reason : new Error('Language request aborted')
				);
			};
			if (signal?.aborted) return abort();
			signal?.addEventListener('abort', abort, { once: true });
			this.pending.set(id, {
				resolve: (value) => {
					clearTimeout(timer);
					signal?.removeEventListener('abort', abort);
					resolve(value);
				},
				reject: (error) => {
					clearTimeout(timer);
					signal?.removeEventListener('abort', abort);
					reject(error);
				}
			});
			this.writeFrame(child, { protocol: 1, id, method, ...fields });
		});
	}

	private writeFrame(child: ChildProcessWithoutNullStreams, frame: object): void {
		if (this.process !== child || child.stdin.destroyed || !child.stdin.writable) {
			this.childFailure(
				child,
				new Error(`Language provider ${this.descriptor.id} closed its request pipe`)
			);
			return;
		}
		try {
			child.stdin.write(`${JSON.stringify(frame)}\n`);
		} catch (error) {
			this.childFailure(child, error instanceof Error ? error : new Error(String(error)));
		}
	}

	private receive(child: ChildProcessWithoutNullStreams, line: string): void {
		if (this.process !== child) return;
		if (Buffer.byteLength(line) > exactLanguageProtocolLimits.responseBytes) {
			this.protocolFailure('Language provider returned an oversized response');
			return;
		}
		let response: ExactLanguageRunnerResponse;
		try {
			response = JSON.parse(line) as ExactLanguageRunnerResponse;
		} catch {
			this.protocolFailure('Language provider returned malformed JSON');
			return;
		}
		if (
			response.protocol !== 1 ||
			!Number.isSafeInteger(response.id) ||
			(response.error !== undefined) === (response.result !== undefined)
		) {
			this.protocolFailure('Language provider returned an invalid protocol frame');
			return;
		}
		const pending = this.pending.get(response.id);
		if (!pending) return;
		this.pending.delete(response.id);
		if (response.error) pending.reject(new Error(response.error.message));
		else pending.resolve(response.result);
	}

	private childFailure(child: ChildProcessWithoutNullStreams, error: Error): void {
		if (this.process !== child) return;
		this.process = undefined;
		this.stopOutput?.();
		this.stopOutput = undefined;
		this.initialize = undefined;
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
		if (!this.failureRecorded()) this.recordFailure();
		this.message = error.message;
		if (!child.killed) child.kill();
	}

	private failureRecorded(): boolean {
		return this.health === 'failed' || this.health === 'quarantined';
	}

	private recordFailure(): void {
		const now = Date.now();
		this.failures.push(now);
		while (this.failures.length && this.failures[0]! < now - 60_000) this.failures.shift();
		this.health = this.failures.length >= 3 ? 'quarantined' : 'failed';
		if (this.health === 'quarantined') {
			const child = this.process;
			this.process = undefined;
			this.initialize = undefined;
			if (child && !child.killed) child.kill();
		}
	}

	private protocolFailure(message: string): void {
		const error = new Error(`${message} (${this.descriptor.id})`);
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
		this.message = error.message;
		this.recordFailure();
		const child = this.process;
		this.process = undefined;
		this.initialize = undefined;
		if (child && !child.killed) child.kill();
	}
}

function providerStatusProvenance(
	descriptor: ExactLanguageProviderDescriptor,
	config: ExactLanguageExtensionsConfig | undefined
): Pick<
	ExactLanguageProviderStatus,
	'packageRoot' | 'manifestPath' | 'integrity' | 'entry' | 'ignoredRoles'
> {
	const roles: ExactLanguageExtensionRole[] = [
		'declarative',
		'analyzer',
		'diagnostics',
		'completions',
		'hover',
		'inlayHints',
		'codeActions'
	];
	return Object.freeze({
		packageRoot: descriptor.packageRoot,
		manifestPath: descriptor.manifestPath,
		...(descriptor.integrity ? { integrity: descriptor.integrity } : {}),
		...(descriptor.entry ? { entry: descriptor.entry } : {}),
		ignoredRoles: Object.freeze(roles.filter((role) => roleIgnored(config, descriptor, role)))
	});
}

function roleIgnored(
	config: ExactLanguageExtensionsConfig | undefined,
	descriptor: ExactLanguageProviderDescriptor,
	capability: ExactLanguageExtensionRole
): boolean {
	return (config?.ignore ?? []).some((rule) => {
		if (!rule.roles.includes(capability)) return false;
		if ('provider' in rule) return rule.provider === descriptor.id;
		return (
			(rule.package.endsWith('/')
				? descriptor.id.startsWith(rule.package)
				: descriptor.id === rule.package) &&
			(!rule.version || rule.version === descriptor.version) &&
			(!rule.integrity || rule.integrity === descriptor.integrity)
		);
	});
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted)
		throw signal.reason instanceof Error ? signal.reason : new Error('Language request aborted');
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', abort);
			resolve();
		}, milliseconds);
		const abort = (): void => {
			clearTimeout(timer);
			reject(
				signal?.reason instanceof Error ? signal.reason : new Error('Language request aborted')
			);
		};
		if (signal?.aborted) return abort();
		signal?.addEventListener('abort', abort, { once: true });
	});
}
