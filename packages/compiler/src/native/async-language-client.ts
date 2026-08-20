import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { resolveNativeCompilerExecutable } from './executable.js';
import {
	nativeCompilerProtocolVersion,
	type NativeCompilerRequest,
	type NativeCompilerResponse
} from './process-contracts.js';

const defaultTimeoutMs = 30_000;

/** Options for the nonblocking native transport used by editor workloads. */
export type ExactNativeLanguageClientOptions = Readonly<{
	executable?: string;
	args?: readonly string[];
	timeoutMs?: number;
}>;

/** Asynchronous transport contract for a retained native language session. */
export interface ExactNativeLanguageClient {
	request<T extends NativeCompilerResponse = NativeCompilerResponse>(
		request: NativeCompilerRequest,
		signal?: AbortSignal
	): Promise<T>;
	dispose(): Promise<void>;
}

/**
 * Owns a restartable native compiler subprocess without blocking the caller's event loop.
 * Requests remain mutation ordered, while cancellation and timeouts terminate a wedged phase.
 * The last successful complete synchronization is replayed into a replacement process.
 */
export class NativeCompilerLanguageClient implements ExactNativeLanguageClient {
	private child: ChildProcessWithoutNullStreams | undefined;
	private lines: Interface | undefined;
	private readonly pendingLines: Array<{
		resolve(line: string): void;
		reject(error: Error): void;
	}> = [];
	private readonly queuedLines: string[] = [];
	private readonly executable: string;
	private readonly args: readonly string[];
	private readonly timeoutMs: number;
	private tail: Promise<void> = Promise.resolve();
	private activeSignal: AbortSignal | undefined;
	private synchronization: NativeCompilerRequest | undefined;
	private failed: Error | undefined;
	private disposed = false;

	constructor(options: ExactNativeLanguageClientOptions = {}) {
		this.executable = options.executable ?? resolveNativeCompilerExecutable();
		this.args = options.args ?? [];
		this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
		if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0)
			throw new Error('Native compiler timeoutMs must be a positive integer');
		this.startProcess();
	}

	/** Sends one serialized request with immediate cancellation and a bounded native wait. */
	request<T extends NativeCompilerResponse = NativeCompilerResponse>(
		request: NativeCompilerRequest,
		signal?: AbortSignal
	): Promise<T> {
		this.assertActive();
		if (signal?.aborted) return Promise.reject(abortError(signal));
		let settled = false;
		let resolveResult!: (value: T) => void;
		let rejectResult!: (reason: unknown) => void;
		const result = new Promise<T>((resolve, reject) => {
			resolveResult = resolve;
			rejectResult = reject;
		});
		const rejectOnce = (error: unknown) => {
			if (settled) return;
			settled = true;
			rejectResult(error);
		};
		const abort = () => {
			const error = abortError(signal!);
			rejectOnce(error);
			if (this.activeSignal === signal) this.interruptProcess(error);
		};
		signal?.addEventListener('abort', abort, { once: true });
		this.tail = this.tail.then(async () => {
			try {
				this.assertActive();
				if (signal?.aborted) throw abortError(signal);
				await this.ensureProcess(request);
				this.activeSignal = signal;
				const response = await this.send(request);
				if (signal?.aborted) throw abortError(signal);
				if (request.kind === 'synchronize') this.synchronization = request;
				else if (request.kind === 'reset') this.synchronization = undefined;
				if (!settled) {
					settled = true;
					resolveResult(response as T);
				}
			} catch (error) {
				rejectOnce(error);
			} finally {
				if (this.activeSignal === signal) this.activeSignal = undefined;
				signal?.removeEventListener('abort', abort);
			}
		});
		return result;
	}

	/** Releases the native session and rejects queued or future work. */
	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.stopProcess(new Error('This eXact native language client has been disposed'));
		await this.tail.catch(() => undefined);
	}

	private async ensureProcess(nextRequest: NativeCompilerRequest): Promise<void> {
		if (this.child) return;
		this.assertActive();
		this.startProcess();
		if (this.synchronization && nextRequest.kind !== 'synchronize' && nextRequest.kind !== 'reset')
			await this.send(this.synchronization);
	}

	private startProcess(): void {
		const child = spawn(this.executable, [...this.args], {
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true
		});
		const lines = createInterface({ input: child.stdout });
		this.child = child;
		this.lines = lines;
		this.failed = undefined;
		child.stderr.resume();
		lines.on('line', (line) => {
			if (this.child !== child) return;
			const pending = this.pendingLines.shift();
			if (pending) pending.resolve(line);
			else this.queuedLines.push(line);
		});
		child.once('error', (error) => {
			if (this.child === child) this.interruptProcess(error);
		});
		child.once('exit', (code, signal) => {
			if (!this.disposed && this.child === child)
				this.interruptProcess(
					new Error(`Native compiler exited with ${code ?? signal ?? 'an unknown status'}`)
				);
		});
	}

	private async send(request: NativeCompilerRequest): Promise<NativeCompilerResponse> {
		const child = this.child;
		if (!child) throw this.failed ?? new Error('Native compiler process is unavailable');
		child.stdin.write(`${JSON.stringify(request)}\n`);
		const raw = await this.nextLine(request.kind);
		const response = JSON.parse(raw) as NativeCompilerResponse;
		validateResponse(response);
		if (response.error) throw new Error(response.error);
		return response;
	}

	private nextLine(operation: string): Promise<string> {
		const queued = this.queuedLines.shift();
		if (queued !== undefined) return Promise.resolve(queued);
		if (this.failed) return Promise.reject(this.failed);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				const error = new Error(`Native compiler timed out during ${operation}`);
				this.interruptProcess(error);
			}, this.timeoutMs);
			(timer as { unref?: () => void }).unref?.();
			this.pendingLines.push({
				resolve(line) {
					clearTimeout(timer);
					resolve(line);
				},
				reject(error) {
					clearTimeout(timer);
					reject(error);
				}
			});
		});
	}

	private interruptProcess(error: Error): void {
		this.failed = error;
		this.stopProcess(error);
		if (!this.disposed) this.failed = undefined;
	}

	private stopProcess(error: Error): void {
		const child = this.child;
		this.child = undefined;
		this.lines?.close();
		this.lines = undefined;
		this.queuedLines.length = 0;
		for (const pending of this.pendingLines.splice(0)) pending.reject(error);
		if (child?.exitCode === null) child.kill();
	}

	private assertActive(): void {
		if (this.disposed) throw new Error('This eXact native language client has been disposed');
	}
}

function validateResponse(response: NativeCompilerResponse): void {
	if (response.protocolVersion !== nativeCompilerProtocolVersion) {
		throw new Error(
			`Native compiler protocol ${response.protocolVersion || '<missing>'} is incompatible with ${nativeCompilerProtocolVersion}`
		);
	}
	if (!response.analysis || !Array.isArray(response.diagnostics))
		throw new Error('Native compiler returned an invalid language response');
}

function abortError(signal: AbortSignal): Error {
	if (signal.reason instanceof Error) return signal.reason;
	const error = new Error('The eXact language request was cancelled');
	error.name = 'AbortError';
	return error;
}
