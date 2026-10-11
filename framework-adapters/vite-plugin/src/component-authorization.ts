import { runExactViteAuthorizationGeneration } from './authorization-generation.js';
import { isMissingExactOptionalEnhancement as isMissingOptionalEnhancement } from '@exactjs/compiler/adapter-support';
import { materializeExactComponentExecutionGuard } from '@exactjs/component-library-policy';
import type { ExactComponentBuildFacts } from '@exactjs/compiler';
import type { ExactComponentLibraryTrustConfig } from '@exactjs/config';
import {
	createExactComponentAuthorizationSession,
	recordExactNodeComponentProvenance,
	type ExactComponentAuthorizationSession,
	type ExactResolvedComponentCandidate
} from '@exactjs/component-library-policy';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { exactModuleFilename } from './module-selection.js';

const omittedEnhancementPrefix = '\0exact:omitted-enhancement/';

/** Module resolution shape retained while component candidates cross Vite authorization. */
export type ExactViteResolution =
	| string
	| { id: string; external?: boolean | 'absolute' | 'relative' }
	| null;

/** Immutable authorization artifacts emitted after a successful server build. */
export type ExactViteAuthorizationArtifacts = NonNullable<
	Awaited<ReturnType<ExactComponentAuthorizationSession['commitGeneration']>>
>;

/** Compiler facts retained across authorization generations without retaining source text. */
export type ExactViteComponentFactRecord = Readonly<{
	facts: ExactComponentBuildFacts;
	version: string;
	source: 'compiler' | 'published';
}>;

type ExactViteAuthorizedCandidate = Readonly<{
	resolvedModuleId: string;
	source: string;
	importerModuleId: string;
	executionReason?: ExactResolvedComponentCandidate['reason'];
}>;

/** Owns Vite's build-scoped compiler facts and replaceable authorization generation. */
export class ExactViteComponentAuthorization {
	readonly #facts = new Map<string, ExactViteComponentFactRecord>();
	readonly #preflighted = new Map<
		string,
		Promise<{ resolution: ExactViteResolution; facts?: ExactComponentBuildFacts }>
	>();
	readonly #pendingCandidates = new Map<string, ExactViteAuthorizedCandidate>();
	readonly #acceptedCandidates = new Map<string, ExactViteAuthorizedCandidate>();
	readonly #authorizationInputs = new Set<string>();
	readonly #publishedModules = new Set<string>();
	#session?: ExactComponentAuthorizationSession;
	#needsReplay = false;
	#replaying?: Promise<void>;

	/** Reports whether a server authorization generation is currently open. */
	get active(): boolean {
		return this.#session !== undefined;
	}

	/** Replaces the current generation while replaying compiler facts for unchanged importers. */
	open(options: {
		applicationRoot: string;
		buildKey?: string;
		config?: ExactComponentLibraryTrustConfig;
	}): void {
		// Initial dev module loads are validated before the first HMR commit.
		for (const [key, candidate] of this.#pendingCandidates)
			this.#acceptedCandidates.set(key, candidate);
		for (const [key, candidate] of this.#acceptedCandidates)
			if (this.#facts.get(exactModuleFilename(candidate.importerModuleId))?.source === 'published')
				this.#acceptedCandidates.delete(key);
		// Publication metadata belongs to a generation. Retain authored roots only,
		// then read the current published closure through the participation validator.
		for (const [moduleId, record] of this.#facts)
			if (record.source === 'published') this.#facts.delete(moduleId);
		this.#needsReplay = this.#acceptedCandidates.size > 0;
		this.#replaying = undefined;
		this.#session?.dispose();
		this.#preflighted.clear();
		this.#pendingCandidates.clear();
		this.#session = createExactComponentAuthorizationSession({
			buildKey: authorizationBuildKey(options.applicationRoot, options.buildKey),
			config: options.config
		});
		for (const [moduleId, record] of this.#facts)
			this.#session.recordImporterFacts(moduleId, record.facts, record.version);
	}

	/** Records one compiler projection and its content identity in the active generation. */
	record(moduleId: string, facts: ExactComponentBuildFacts, source: string): void {
		// Published ownership survives invalidation, while its metadata is reread per generation.
		if (this.#publishedModules.has(exactModuleFilename(moduleId))) return;
		const record = Object.freeze({
			facts,
			version: sourceVersion(source),
			source: 'compiler' as const
		});
		this.#facts.set(moduleId, record);
		this.#session?.recordImporterFacts(moduleId, facts, record.version);
	}

	/** Removes changed importer facts and returns them for last-valid-generation recovery. */
	invalidate(moduleId: string): ExactViteComponentFactRecord | undefined {
		const previous = this.#facts.get(moduleId);
		this.#facts.delete(moduleId);
		this.#session?.rejectGeneration();
		return previous;
	}

	/** Restores importer facts after a rejected HMR preflight. */
	restore(moduleId: string, record: ExactViteComponentFactRecord | undefined): void {
		if (record) this.#facts.set(moduleId, record);
		else this.#facts.delete(moduleId);
	}

	/** Reports whether an authored resolver edge requires the pre-evaluation server gate. */
	requires(source: string, importer: string | undefined): boolean {
		if (!importer || !this.#session) return false;
		const facts = this.#facts.get(exactModuleFilename(importer))?.facts;
		return (
			facts?.componentImports.some(
				(edge) => edge.moduleSpecifier === source && edge.artifactTargets.includes('server')
			) === true ||
			facts?.rendererEnhancements.some((edge) => edge.moduleSpecifier === source) === true
		);
	}

	/** Authorizes one resolved component edge before Vite loads the candidate module. */
	async authorize(
		resolved: ExactViteResolution,
		source: string,
		importer: string | undefined,
		options: {
			applicationRoot: string;
			executionReason?: ExactResolvedComponentCandidate['reason'];
			watch(file: string): void;
			warn?: (message: string) => void;
		},
		visited?: Set<string>
	): Promise<ExactViteResolution> {
		if (!resolved || !importer || !this.#session) return resolved;
		return runExactViteAuthorizationGeneration(
			() => this.#session,
			(session, assertCurrent) =>
				this.authorizeGeneration(
					resolved,
					source,
					importer,
					options,
					session,
					assertCurrent,
					visited
				)
		);
	}

	private async authorizeGeneration(
		resolved: NonNullable<ExactViteResolution>,
		source: string,
		importer: string,
		options: Parameters<ExactViteComponentAuthorization['authorize']>[3],
		session: ExactComponentAuthorizationSession,
		assertCurrent: () => void,
		visited?: Set<string>
	): Promise<ExactViteResolution> {
		if (!visited) {
			// A cached consumer need not resolve again when a descendant reloads. Seed
			// the new generation from current root evidence before admitting that edge.
			if (this.#needsReplay) {
				this.#needsReplay = false;
				this.#replaying = this.revalidate(options);
			}
			await this.#replaying;
			assertCurrent();
		}
		visited ??= new Set<string>();
		const importerModuleId = exactModuleFilename(importer);
		const importerRecord = this.#facts.get(importerModuleId);
		if (!importerRecord) return resolved;
		const componentEdge = importerRecord.facts.componentImports.find(
			(edge) => edge.moduleSpecifier === source && edge.artifactTargets.includes('server')
		);
		const enhancementEdge = importerRecord.facts.rendererEnhancements.find(
			(edge) => edge.moduleSpecifier === source
		);
		if (!componentEdge && !enhancementEdge) return resolved;
		const bundlerModuleId = typeof resolved === 'string' ? resolved : resolved.id;
		let resolvedModuleId: string;
		try {
			resolvedModuleId = physicalViteModuleId(bundlerModuleId, importer, source);
		} catch (error) {
			if (!enhancementEdge || !isMissingOptionalEnhancement(error, source)) throw error;
			return `${omittedEnhancementPrefix}${encodeURIComponent(enhancementEdge.identity)}`;
		}
		const preflightKey = [
			importerModuleId,
			source,
			componentEdge?.exportName ?? enhancementEdge!.exportName,
			resolvedModuleId,
			options.executionReason ?? ''
		].join('\0');
		let pending = this.#preflighted.get(preflightKey);
		if (!pending) {
			// Cache only this edge's decision. Each traversal walks its own dependency closure,
			// so concurrent cyclic package graphs cannot await each other's recursive work.
			pending = (async () => {
				const provenance = await recordExactNodeComponentProvenance({
					session,
					applicationRoot: options.applicationRoot,
					importerModuleId,
					moduleSpecifier: source,
					resolvedModuleId
				});
				assertCurrent();
				for (const file of provenance.watchFiles) options.watch(file);
				assertCurrent();
				for (const file of provenance.watchFiles) this.#authorizationInputs.add(path.resolve(file));
				if (provenance.applicationOwned) {
					this.#publishedModules.delete(exactModuleFilename(resolvedModuleId));
					return { resolution: resolved };
				}
				const authorization = await session.authorizeResolvedComponent(
					Object.freeze({
						importerModuleId,
						moduleSpecifier: source,
						exportName: componentEdge?.exportName ?? enhancementEdge!.exportName,
						resolvedModuleId,
						packageInstanceKey: provenance.instance.key,
						reason:
							options.executionReason ??
							(enhancementEdge ? 'server-enhancement' : serverReason(componentEdge!.reason)),
						...(enhancementEdge ? { optionalEnhancementIdentity: enhancementEdge.identity } : {})
					})
				);
				assertCurrent();
				let facts: ExactComponentBuildFacts | undefined;
				if (authorization.outcome === 'authorized') {
					for (const file of authorization.watchFiles) {
						options.watch(file);
						this.#authorizationInputs.add(path.resolve(file));
					}
					assertCurrent();
					facts = authorization.componentBuild;
					const record = Object.freeze({
						facts,
						version: sourceVersion(JSON.stringify(facts)),
						source: 'published' as const
					});
					this.#publishedModules.add(exactModuleFilename(facts.filename));
					this.#facts.set(exactModuleFilename(facts.filename), record);
				}
				const result =
					authorization.outcome === 'omitted'
						? `${omittedEnhancementPrefix}${encodeURIComponent(authorization.enhancementIdentity)}`
						: {
								...(typeof resolved === 'object' ? resolved : {}),
								id: resolvedModuleId,
								external: false
							};
				// Published component artifacts contain optional edges that must pass through the
				// consumer resolver. Node externalization would execute publication-time facades.
				return { resolution: result, facts };
			})();
			this.#preflighted.set(preflightKey, pending);
		}
		try {
			const { resolution, facts } = await pending;
			assertCurrent();
			if (visited.has(preflightKey)) return resolution;
			visited.add(preflightKey);
			if (facts)
				await this.preflightPublishedEdges(facts, { ...options, warn: undefined }, visited);
			assertCurrent();
			this.#pendingCandidates.set(
				preflightKey,
				Object.freeze({
					resolvedModuleId,
					source,
					importerModuleId,
					...(options.executionReason ? { executionReason: options.executionReason } : {})
				})
			);
			return resolution;
		} catch (error) {
			assertCurrent();
			if (options.warn) {
				const guarded = materializeExactComponentExecutionGuard(
					error,
					resolvedModuleId,
					options.applicationRoot,
					options.warn
				);
				if (guarded) {
					return { id: guarded, external: false };
				}
			}
			if (this.#preflighted.get(preflightKey) === pending) this.#preflighted.delete(preflightKey);
			throw error;
		}
	}

	/** Commits authorization artifacts and optionally opens the next development generation atomically. */
	async commit(
		reopen?: Parameters<ExactViteComponentAuthorization['open']>[0]
	): Promise<
		Awaited<ReturnType<ExactComponentAuthorizationSession['commitGeneration']>> | undefined
	> {
		if (!this.#session) return undefined;
		const committed = this.#session.commitGeneration();
		this.#acceptedCandidates.clear();
		for (const [key, candidate] of this.#pendingCandidates)
			this.#acceptedCandidates.set(key, candidate);
		this.#pendingCandidates.clear();
		if (reopen) this.open(reopen);
		return committed;
	}

	/** Reauthorizes compiler-owned graph roots and their current published closure before replacement. */
	async revalidate(
		options: Parameters<ExactViteComponentAuthorization['authorize']>[3],
		excludedImporter?: string
	): Promise<void> {
		await runExactViteAuthorizationGeneration(
			() => this.#session,
			async (_session, assertCurrent) => {
				this.#needsReplay = false;
				const excluded = excludedImporter ? exactModuleFilename(excludedImporter) : undefined;
				for (const candidate of [...this.#acceptedCandidates.values()]) {
					assertCurrent();
					// Published descendants are traversed from their consumer roots. Replaying them
					// independently can precede the root dependency evidence or retain orphaned edges.
					if (
						this.#facts.get(exactModuleFilename(candidate.importerModuleId))?.source === 'published'
					)
						continue;
					if (excluded && exactModuleFilename(candidate.importerModuleId) === excluded) continue;
					await this.authorize(
						candidate.resolvedModuleId,
						candidate.source,
						candidate.importerModuleId,
						{
							...options,
							...(candidate.executionReason ? { executionReason: candidate.executionReason } : {})
						},
						new Set<string>()
					);
				}
			}
		);
	}

	/** Reports whether a changed file is part of the committed package-policy input set. */
	watches(filename: string): boolean {
		return this.#authorizationInputs.has(path.resolve(filename));
	}

	/** Rejects the current generation without discarding reusable compiler facts. */
	reject(): void {
		this.#session?.rejectGeneration();
		this.#pendingCandidates.clear();
		this.#preflighted.clear();
	}

	/** Releases the generation and all retained compiler facts. */
	dispose(): void {
		this.#session?.dispose();
		this.#session = undefined;
		this.#needsReplay = false;
		this.#replaying = undefined;
		this.#facts.clear();
		this.#publishedModules.clear();
		this.#preflighted.clear();
		this.#pendingCandidates.clear();
		this.#acceptedCandidates.clear();
		this.#authorizationInputs.clear();
	}

	private async preflightPublishedEdges(
		facts: ExactComponentBuildFacts,
		options: Parameters<ExactViteComponentAuthorization['authorize']>[3],
		visited: Set<string>
	): Promise<void> {
		for (const edge of facts.componentImports) {
			if (!edge.artifactTargets.includes('server')) continue;
			await this.authorize(
				edge.moduleSpecifier,
				edge.moduleSpecifier,
				facts.filename,
				{
					...options,
					executionReason: serverReason(edge.reason)
				},
				visited
			);
		}
		for (const enhancement of facts.rendererEnhancements) {
			await this.authorize(
				enhancement.moduleSpecifier,
				enhancement.moduleSpecifier,
				facts.filename,
				{ ...options, executionReason: 'server-enhancement' },
				visited
			);
		}
	}
}

function physicalViteModuleId(resolvedModuleId: string, importer: string, source: string): string {
	const clean = resolvedModuleId.replace(/[?#].*$/, '');
	if (path.isAbsolute(clean)) return clean;
	const resolve = createRequire(importer).resolve;
	try {
		return resolve(clean);
	} catch {
		return resolve(source);
	}
}

/** Identifies the inactive virtual module returned for one omitted enhancement. */
export function isExactViteOmittedEnhancement(id: string): boolean {
	return id.startsWith(omittedEnhancementPrefix);
}

function serverReason(
	reason: ExactComponentBuildFacts['componentImports'][number]['reason']
): ExactResolvedComponentCandidate['reason'] {
	if (reason === 'enhancement') return 'server-enhancement';
	if (reason === 'task-owner') return 'server-task';
	if (reason === 'continuation') return 'server-component';
	return 'ssr';
}

function sourceVersion(source: string): string {
	return createHash('sha256').update(source).digest('base64url');
}

function authorizationBuildKey(applicationRoot: string, configured?: string): string {
	return (
		configured ??
		`vite-${createHash('sha256').update(path.resolve(applicationRoot)).digest('base64url')}`
	);
}
