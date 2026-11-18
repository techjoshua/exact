import { publishExactProfile, type ExactProfileSink } from '@exactjs/instrumentation';
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
import { clearSourceHelperOwnership } from '../compilation/source-helper-ownership.js';
import { classifyExactWatchInvalidation } from './watch-invalidation.js';

/** Owns one persistent native compiler process for a compiler or bundler lifecycle. */
export class ExactCompilerSession {
	private readonly nativeCompiler: NativeCompilerProcess;
	private readonly onProfile?: ExactProfileSink<ExactCompilerProfileEvent>;
	private disposed = false;
	private analysisPolicy: ExactCompilerSessionOptions['analysis'];

	constructor(options: ExactCompilerSessionOptions = {}) {
		this.onProfile = options.onProfile;
		this.analysisPolicy = options.analysis;
		this.nativeCompiler = new NativeCompilerProcess(
			options.nativeCompiler ?? { executable: resolveNativeCompilerExecutable() }
		);
	}

	/** Updates advisory reporting for the application without invalidating semantic facts. */
	setAnalysisPolicy(policy: ExactCompilerSessionOptions['analysis']): void {
		this.assertActive();
		this.analysisPolicy = policy;
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
		const response = this.nativeCompiler.request({
			...request,
			analysis: request.analysis ?? this.analysisPolicy,
			traceAnalysisCost: request.traceAnalysisCost ?? Boolean(this.onProfile)
		});
		if (request.kind === 'reset') clearSourceHelperOwnership(this);
		this.profile('native-request', started, {
			cached: response.cacheHit ? 1 : 0,
			dependencies: response.analysis.imports.length,
			...(response.counters ?? {})
		});
		return response;
	}

	/**
	 * Returns retained inputs for build-tool watching, including type-only imports and ambient types.
	 * A filename selects its dependencies and excludes that file. Omission returns all retained inputs.
	 * Queries the current generation and throws if the native host cannot supply its watch inputs.
	 */
	watchFiles(filename?: string): readonly string[] {
		this.assertActive();
		const response = this.nativeCompiler.request({ kind: 'watch-files', id: filename });
		if (response.error)
			throw new Error(`Unable to collect compiler watch inputs: ${response.error}`);
		return response.projectFiles ?? [];
	}

	/** Invalidates retained project state after a watched file changes. */
	invalidate(filename: string, removed = false): ExactCompilerInvalidation {
		this.assertActive();
		const started = this.onProfile ? performance.now() : undefined;
		const absoluteFilename = path.resolve(filename);
		const kind = classifyExactWatchInvalidation(absoluteFilename);
		if (kind === 'ignore') {
			const ignoredResult: ExactCompilerInvalidation = { affectedFiles: [], diagnostics: [] };
			this.profile('invalidate', started, { affectedFiles: 0 });
			return ignoredResult;
		}
		if (kind === 'project' || removed || !existsSync(absoluteFilename)) {
			this.nativeCompiler.request({ kind: 'reset' });
			clearSourceHelperOwnership(this);
			const removedResult = {
				affectedFiles: [absoluteFilename],
				diagnostics: [] as ExactCompilerInvalidation['diagnostics']
			};
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
			return {
				code: diagnostic.code,
				message: diagnostic.message,
				filename: diagnosticFilename,
				...(diagnostic.start === undefined
					? {}
					: { span: sourceLocation(source, diagnostic.start) })
			};
		});
		const result = {
			affectedFiles: [
				...new Set([absoluteFilename, ...diagnostics.map((diagnostic) => diagnostic.filename)])
			],
			diagnostics: diagnostics
		};
		this.profile('invalidate', started, { affectedFiles: result.affectedFiles.length });
		return result;
	}

	/** Clears retained native project state. */
	clear(): void {
		this.assertActive();
		const started = this.onProfile ? performance.now() : undefined;
		this.nativeCompiler.request({ kind: 'reset' });
		clearSourceHelperOwnership(this);
		this.profile('clear', started);
	}

	/** Releases resources owned by this compiler session. */
	dispose(): void {
		if (this.disposed) return;
		this.nativeCompiler.dispose();
		clearSourceHelperOwnership(this);
		this.disposed = true;
	}

	/** Returns the stable native-session resource shape. */
	stats(): ExactCompilerSessionStats {
		this.assertActive();
		return {
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
		};
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
		publishExactProfile(this.onProfile, {
			subsystem: 'compiler',
			phase,
			elapsedMs: performance.now() - started,
			...(counts ? { counts } : {})
		});
	}
}

function sourceLocation(
	source: string,
	offset: number
): Readonly<{ line: number; column: number }> {
	const before = source.slice(0, offset);
	const lines = before.split(/\r\n|\r|\n/);
	return { line: lines.length, column: lines.at(-1)!.length + 1 };
}
