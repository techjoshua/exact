import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
	NativeCompilerLanguageClient,
	type ExactNativeLanguageClient
} from '../native/async-language-client.js';
import type { NativeCompilerResponse } from '../native/process-contracts.js';
import type {
	ExactInspectionRequest,
	ExactLanguageService,
	ExactLanguageServiceChange,
	ExactLanguageServiceOptions,
	ExactLanguageServiceStats,
	ExactLanguageServiceUpdate,
	ExactRefactorPlan,
	ExactRefactorRequest,
	ExactSourceDiagnostic,
	ExactSourceInspection
} from './contracts.js';
import {
	applyRefactorEdits,
	equivalentExactDiagnostics,
	equivalentTaskClassification,
	inspectedTasks,
	rangesOverlap,
	refactorFilename
} from './refactor-equivalence.js';
import { planExactTaskRefactor } from './task-refactor.js';
import { createExactSourceInspection } from './source-inspection.js';
import {
	defaultMaxCachedAnalyses,
	defaultMaxCachedAnalysisBytes,
	estimateAnalysisBytes,
	isLanguageSource,
	isProjectConfiguration,
	positiveCacheLimit,
	sourceBytes,
	staleError,
	sum,
	throwIfAborted
} from './service-support.js';

type SourceSnapshot = Readonly<{
	version: number;
	source: string;
	overlay: boolean;
}>;

type AnalysisSnapshot = Readonly<{
	source: string;
	response: NativeCompilerResponse;
	estimatedBytes: number;
}>;

/** Optional ownership injection used by protocol hosts and focused tests. */
export type ExactLanguageServiceHostOptions = Readonly<{
	nativeClient?: ExactNativeLanguageClient;
}>;

/**
 * Owns one no-emit native project plus its unsaved document overlays.
 *
 * Synchronizations are atomic from the caller's perspective. Native results
 * are published only after cancellation and document-version fences pass.
 */
export class ExactCompilerLanguageService implements ExactLanguageService {
	private readonly root: string;
	private readonly configFile?: string;
	private readonly projectKind: 'configured' | 'inferred';
	private readonly client: ExactNativeLanguageClient;
	private readonly ownsClient: boolean;
	private readonly maxCachedAnalyses: number;
	private readonly maxCachedAnalysisBytes: number;
	private readonly snapshots = new Map<string, SourceSnapshot>();
	private readonly analyses = new Map<string, AnalysisSnapshot>();
	private readonly imports = new Map<string, ReadonlySet<string>>();
	private generation = 0;
	private lastChangedFiles = 0;
	private lastAffectedFiles = 0;
	private lastSynchronizationMs = 0;
	private analysisEvictions = 0;
	private disposed = false;

	constructor(options: ExactLanguageServiceOptions, host: ExactLanguageServiceHostOptions = {}) {
		if (!options.root) throw new TypeError('eXact language service root is required');
		if (options.noEmit !== undefined && options.noEmit !== true)
			throw new TypeError('eXact language services are always noEmit');
		this.root = path.resolve(options.root);
		this.configFile = options.configFile ? path.resolve(this.root, options.configFile) : undefined;
		this.projectKind = options.projectKind ?? 'configured';
		this.maxCachedAnalyses = positiveCacheLimit(
			options.maxCachedAnalyses,
			defaultMaxCachedAnalyses,
			'maxCachedAnalyses'
		);
		this.maxCachedAnalysisBytes = positiveCacheLimit(
			options.maxCachedAnalysisBytes,
			defaultMaxCachedAnalysisBytes,
			'maxCachedAnalysisBytes'
		);
		this.client = host.nativeClient ?? new NativeCompilerLanguageClient();
		this.ownsClient = host.nativeClient === undefined;
	}

	/** Applies overlays, analyzes affected files, and publishes one immutable generation. */
	async synchronize(
		changes: readonly ExactLanguageServiceChange[],
		signal?: AbortSignal
	): Promise<ExactLanguageServiceUpdate> {
		this.assertActive();
		const started = performance.now();
		throwIfAborted(signal);
		const changedFiles: string[] = [];
		let reset = false;
		for (const change of changes) {
			const filename = this.filename(change.filename);
			if (change.kind === 'upsert') {
				const previous = this.snapshots.get(filename);
				if (previous && change.version <= previous.version) continue;
				this.snapshots.set(
					filename,
					Object.freeze({ version: change.version, source: change.source, overlay: true })
				);
				changedFiles.push(filename);
				if (isProjectConfiguration(filename)) reset = true;
			} else if (change.kind === 'close') {
				if (!this.snapshots.get(filename)?.overlay) continue;
				const disk = this.diskSnapshot(filename);
				if (disk) this.snapshots.set(filename, disk);
				else this.snapshots.delete(filename);
				changedFiles.push(filename);
				if (isProjectConfiguration(filename)) reset = true;
			} else {
				this.snapshots.delete(filename);
				this.analyses.delete(filename);
				this.imports.delete(filename);
				changedFiles.push(filename);
				reset = true;
			}
		}
		if (reset) await this.client.request({ kind: 'reset' }, signal);
		const affected = reset
			? unique([
					...changedFiles,
					...this.snapshots.keys(),
					...this.analyses.keys(),
					...this.imports.keys()
				])
			: this.affectedFiles(changedFiles);
		const diagnostics: ExactSourceDiagnostic[] = [];
		const nextGeneration = this.generation + 1;
		for (const filename of affected) {
			throwIfAborted(signal);
			if (!isLanguageSource(filename)) continue;
			const snapshot = this.snapshots.get(filename) ?? this.diskSnapshot(filename);
			if (!snapshot) continue;
			this.snapshots.set(filename, snapshot);
			const response = await this.analyze(filename, snapshot.source, signal);
			throwIfAborted(signal);
			const current = this.snapshots.get(filename);
			if (!current || current.version !== snapshot.version || current.source !== snapshot.source)
				throw staleError(filename);
			this.storeAnalysis(filename, snapshot, response);
			this.imports.set(filename, importedFiles(filename, response, this.root));
			diagnostics.push(
				...createExactSourceInspection(filename, snapshot.source, nextGeneration, response)
					.diagnostics
			);
		}
		throwIfAborted(signal);
		this.generation = nextGeneration;
		this.lastChangedFiles = unique(changedFiles).length;
		this.lastAffectedFiles = unique(affected).length;
		this.lastSynchronizationMs = performance.now() - started;
		this.releaseDiskSnapshots();
		this.enforceAnalysisBudget();
		return Object.freeze({
			generation: this.generation,
			changedFiles: Object.freeze(unique(changedFiles)),
			affectedFiles: Object.freeze(unique(affected)),
			diagnostics: Object.freeze(diagnostics)
		});
	}

	/** Returns bounded project resources and the latest synchronization measurement. */
	stats(): ExactLanguageServiceStats {
		this.assertActive();
		const snapshotSourceBytes = sum(
			[...this.snapshots.values()].map((snapshot) => sourceBytes(snapshot.source))
		);
		const analysisEstimatedBytes = this.analysisBytes();
		return Object.freeze({
			generation: this.generation,
			overlays: [...this.snapshots.values()].filter((snapshot) => snapshot.overlay).length,
			analyzedFiles: this.analyses.size,
			snapshotEntries: this.snapshots.size,
			snapshotSourceBytes,
			analysisEntries: this.analyses.size,
			analysisEstimatedBytes,
			importGraphEntries: this.imports.size,
			importGraphEdges: sum([...this.imports.values()].map((imports) => imports.size)),
			analysisEvictions: this.analysisEvictions,
			cacheOverBudget:
				this.analyses.size > this.maxCachedAnalyses ||
				analysisEstimatedBytes > this.maxCachedAnalysisBytes,
			changedFiles: this.lastChangedFiles,
			affectedFiles: this.lastAffectedFiles,
			lastSynchronizationMs: this.lastSynchronizationMs
		});
	}

	/** Returns a source outline from the newest immutable project generation. */
	async inspect(
		filename: string,
		options: ExactInspectionRequest = {},
		signal?: AbortSignal
	): Promise<ExactSourceInspection> {
		this.assertActive();
		throwIfAborted(signal);
		const normalized = this.filename(filename);
		const snapshot = this.snapshots.get(normalized) ?? this.diskSnapshot(normalized);
		if (!snapshot) throw new Error(`Cannot inspect missing source file ${normalized}`);
		let analysis = this.touchAnalysis(normalized);
		if (!analysis || analysis.source !== snapshot.source) {
			const response = await this.analyze(normalized, snapshot.source, signal);
			throwIfAborted(signal);
			analysis = this.storeAnalysis(normalized, snapshot, response);
			this.snapshots.set(normalized, snapshot);
			this.imports.set(normalized, importedFiles(normalized, response, this.root));
		}
		const inspection = this.withProject(
			createExactSourceInspection(
				normalized,
				snapshot.source,
				this.generation,
				analysis.response,
				options.includeReasons !== false
			)
		);
		this.releaseDiskSnapshots();
		this.enforceAnalysisBudget();
		return inspection;
	}

	/** Plans and verifies one task refactor against the current generation. */
	async refactor(
		request: ExactRefactorRequest,
		signal?: AbortSignal
	): Promise<ExactRefactorPlan | undefined> {
		this.assertActive();
		if (request.generation !== this.generation)
			throw new Error(
				`Stale eXact refactor generation ${request.generation}; current generation is ${this.generation}`
			);
		const filename = this.filename(request.filename);
		const snapshot = this.snapshots.get(filename) ?? this.diskSnapshot(filename);
		if (!snapshot) return undefined;
		const inspection = await this.inspect(filename, undefined, signal);
		const candidate = planExactTaskRefactor(request, snapshot.source, inspection);
		if (!candidate) return undefined;
		throwIfAborted(signal);
		const proposed = applyRefactorEdits(snapshot.source, candidate.edits);
		const response = await this.analyze(refactorFilename(filename), proposed, signal);
		throwIfAborted(signal);
		const baselineDiagnostics = this.analyses.get(filename)?.response.diagnostics ?? [];
		if (!equivalentExactDiagnostics(baselineDiagnostics, response.diagnostics)) return undefined;
		if (candidate.semanticChange === 'none') {
			const beforeTasks = inspectedTasks(inspection);
			const beforeIndex = beforeTasks.findIndex((entity) =>
				rangesOverlap(entity.range, request.range)
			);
			const proposedInspection = createExactSourceInspection(
				refactorFilename(filename),
				proposed,
				this.generation,
				response
			);
			const afterTask = inspectedTasks(proposedInspection)[beforeIndex];
			if (
				beforeIndex < 0 ||
				!afterTask ||
				!equivalentTaskClassification(beforeTasks[beforeIndex]!, afterTask)
			)
				return undefined;
		}
		return candidate;
	}

	/** Disposes the native process and releases every retained overlay. */
	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.snapshots.clear();
		this.analyses.clear();
		this.imports.clear();
		if (this.ownsClient) await this.client.dispose();
	}

	private async analyze(
		filename: string,
		source: string,
		signal?: AbortSignal
	): Promise<NativeCompilerResponse> {
		return this.client.request(
			{
				id: filename,
				kind: 'analyze',
				source,
				root: this.root,
				...(this.configFile ? { configFile: this.configFile } : {}),
				diagnostics: 'semantic'
			},
			signal
		);
	}

	private affectedFiles(changed: readonly string[]): string[] {
		const affected = new Set(changed);
		let advanced = true;
		while (advanced) {
			advanced = false;
			for (const [consumer, dependencies] of this.imports) {
				if (affected.has(consumer)) continue;
				if ([...dependencies].some((dependency) => affected.has(dependency))) {
					affected.add(consumer);
					advanced = true;
				}
			}
		}
		return [...affected];
	}

	private storeAnalysis(
		filename: string,
		snapshot: SourceSnapshot,
		response: NativeCompilerResponse
	): AnalysisSnapshot {
		const analysis = Object.freeze({
			source: snapshot.source,
			response,
			estimatedBytes: estimateAnalysisBytes(snapshot.source, response)
		});
		this.analyses.delete(filename);
		this.analyses.set(filename, analysis);
		return analysis;
	}

	private touchAnalysis(filename: string): AnalysisSnapshot | undefined {
		const analysis = this.analyses.get(filename);
		if (!analysis) return undefined;
		this.analyses.delete(filename);
		this.analyses.set(filename, analysis);
		return analysis;
	}

	private releaseDiskSnapshots(): void {
		for (const [filename, snapshot] of this.snapshots)
			if (!snapshot.overlay) this.snapshots.delete(filename);
	}

	private enforceAnalysisBudget(): void {
		let bytes = this.analysisBytes();
		for (const [filename, analysis] of this.analyses) {
			if (this.analyses.size <= this.maxCachedAnalyses && bytes <= this.maxCachedAnalysisBytes)
				break;
			if (this.snapshots.get(filename)?.overlay) continue;
			this.analyses.delete(filename);
			bytes -= analysis.estimatedBytes;
			this.analysisEvictions++;
		}
	}

	private analysisBytes(): number {
		return sum([...this.analyses.values()].map((analysis) => analysis.estimatedBytes));
	}

	private diskSnapshot(filename: string): SourceSnapshot | undefined {
		if (!existsSync(filename)) return undefined;
		return Object.freeze({ version: -1, source: readFileSync(filename, 'utf8'), overlay: false });
	}

	private filename(filename: string): string {
		return path.resolve(this.root, filename);
	}

	private withProject(inspection: ExactSourceInspection): ExactSourceInspection {
		return Object.freeze({
			...inspection,
			project: Object.freeze({ kind: this.projectKind, root: this.root })
		});
	}

	private assertActive(): void {
		if (this.disposed) throw new Error('This eXact language service has been disposed');
	}
}

/** Creates one isolated no-emit compiler language service. */
export function createExactLanguageService(
	options: ExactLanguageServiceOptions,
	host?: ExactLanguageServiceHostOptions
): ExactLanguageService {
	return new ExactCompilerLanguageService(options, host);
}

function importedFiles(
	filename: string,
	response: NativeCompilerResponse,
	root: string
): ReadonlySet<string> {
	const directory = path.dirname(filename);
	return new Set(
		response.analysis.imports
			.filter((entry) => entry.moduleSpecifier.startsWith('.'))
			.map((entry) => {
				const base = path.resolve(directory, entry.moduleSpecifier);
				for (const candidate of [
					base,
					`${base}.ts`,
					`${base}.tsx`,
					`${base}.js`,
					`${base}.jsx`,
					path.join(base, 'index.ts'),
					path.join(base, 'index.tsx')
				]) {
					if (existsSync(candidate)) return candidate;
				}
				return path.resolve(root, base);
			})
	);
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}
