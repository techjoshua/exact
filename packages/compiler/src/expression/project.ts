import type { ExactProfileSink } from '@exactjs/instrumentation';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { NativeCompilerProcess } from '../native/process.js';
import type { NativeCompilerRequest, NativeCompilerResponse } from '../native/process-contracts.js';
import type {
	ExactCompilerInvalidation,
	ExactCompilerProfileEvent,
	ExactCompilerSessionOptions,
	ExactCompilerSessionStats
} from './session-contracts.js';

/** Owns one persistent native compiler process for a compiler or bundler lifecycle. */
export class ExactCompilerSession {
	private readonly nativeCompiler: NativeCompilerProcess;
	private readonly onProfile?: ExactProfileSink<ExactCompilerProfileEvent>;
	private disposed = false;

	constructor(options: ExactCompilerSessionOptions = {}) {
		this.onProfile = options.onProfile;
		this.nativeCompiler = new NativeCompilerProcess(
			options.nativeCompiler ?? { executable: resolveNativeCompilerExecutable() }
		);
	}

	/** Reports whether transforms owned by this session execute in the native host. */
	hasNativeCompiler(): boolean {
		this.assertActive();
		return true;
	}

	/** Executes one request through this session's persistent native compiler host. */
	compileNative(request: NativeCompilerRequest): NativeCompilerResponse {
		this.assertActive();
		const started = this.onProfile ? performance.now() : undefined;
		const response = this.nativeCompiler.request(request);
		this.profile('native-request', started, {
			cached: response.cacheHit ? 1 : 0,
			dependencies: response.analysis.imports.length
		});
		return response;
	}

	/** Invalidates retained project state after a watched file changes. */
	invalidate(filename: string, removed = false): ExactCompilerInvalidation {
		this.assertActive();
		const started = this.onProfile ? performance.now() : undefined;
		const absoluteFilename = path.resolve(filename);
		if (removed || !existsSync(absoluteFilename)) {
			this.nativeCompiler.request({ kind: 'reset' });
			const removedResult = Object.freeze({
				affectedFiles: Object.freeze([absoluteFilename]),
				diagnostics: Object.freeze([]) as ExactCompilerInvalidation['diagnostics']
			});
			this.profile('invalidate', started, { affectedFiles: 1 });
			return removedResult;
		}
		const response = this.nativeCompiler.request({
			id: absoluteFilename,
			kind: 'diagnose',
			source: readFileSync(absoluteFilename, 'utf8'),
			diagnostics: 'semantic'
		});
		const diagnostics = response.diagnostics.map((diagnostic) => {
			const diagnosticFilename = diagnostic.filename ?? absoluteFilename;
			const source = readFileSync(diagnosticFilename, 'utf8');
			return Object.freeze({
				code: diagnostic.code,
				message: diagnostic.message,
				filename: diagnosticFilename,
				...(diagnostic.start === undefined
					? {}
					: { span: sourceLocation(source, diagnostic.start) })
			});
		});
		const result = Object.freeze({
			affectedFiles: Object.freeze([
				...new Set([absoluteFilename, ...diagnostics.map((diagnostic) => diagnostic.filename)])
			]),
			diagnostics: Object.freeze(diagnostics)
		});
		this.profile('invalidate', started, { affectedFiles: result.affectedFiles.length });
		return result;
	}

	/** Clears retained native project state. */
	clear(): void {
		this.assertActive();
		const started = this.onProfile ? performance.now() : undefined;
		this.nativeCompiler.request({ kind: 'reset' });
		this.profile('clear', started);
	}

	/** Releases resources owned by this compiler session. */
	dispose(): void {
		if (this.disposed) return;
		this.nativeCompiler.dispose();
		this.disposed = true;
	}

	/** Returns the stable native-session resource shape. */
	stats(): ExactCompilerSessionStats {
		this.assertActive();
		return Object.freeze({
			workspaces: 1,
			rebuilds: 0,
			semanticDiagnostics: 0,
			modules: 0,
			dependencyEntries: 0,
			overlays: 0,
			sourceFiles: 0,
			nodeIdentityRoots: 0,
			symbolIdentities: 0,
			languageServices: 0,
			languageServiceAffectedFiles: 0,
			languageServiceSynchronizationMs: 0
		});
	}

	private assertActive(): void {
		if (this.disposed) throw new Error('This eXact compiler session has been disposed');
	}

	private profile(
		phase: ExactCompilerProfileEvent['phase'],
		started: number | undefined,
		counts?: Readonly<Record<string, number>>
	): void {
		if (started === undefined) return;
		this.onProfile?.(
			Object.freeze({
				subsystem: 'compiler',
				phase,
				elapsedMs: performance.now() - started,
				...(counts ? { counts } : {})
			})
		);
	}
}

function sourceLocation(
	source: string,
	offset: number
): Readonly<{ line: number; column: number }> {
	const before = source.slice(0, offset);
	const lines = before.split(/\r\n|\r|\n/);
	return Object.freeze({ line: lines.length, column: lines.at(-1)!.length + 1 });
}
