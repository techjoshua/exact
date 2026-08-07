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

type ExactViteResolution =
	| string
	| { id: string; external?: boolean | 'absolute' | 'relative' }
	| null;

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
	readonly #preflighted = new Map<string, string | null>();
	readonly #pendingCandidates = new Map<string, ExactViteAuthorizedCandidate>();
	readonly #acceptedCandidates = new Map<string, ExactViteAuthorizedCandidate>();
	readonly #authorizationInputs = new Set<string>();
	#session?: ExactComponentAuthorizationSession;

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
		if (this.#facts.get(moduleId)?.source === 'published') return;
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
		}
	): Promise<ExactViteResolution> {
		if (!resolved || !importer || !this.#session) return resolved;
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
		const resolvedModuleId = physicalViteModuleId(bundlerModuleId, importer, source);
		const preflightKey = [
			importerModuleId,
			source,
			componentEdge?.exportName ?? enhancementEdge!.exportName,
			resolvedModuleId,
			options.executionReason ?? ''
		].join('\0');
		if (this.#preflighted.has(preflightKey)) {
			const omitted = this.#preflighted.get(preflightKey);
			return omitted ? omitted : resolved;
		}
		this.#preflighted.set(preflightKey, null);
		try {
			const provenance = await recordExactNodeComponentProvenance({
				session: this.#session,
				applicationRoot: options.applicationRoot,
				importerModuleId,
				moduleSpecifier: source,
				resolvedModuleId
			});
			for (const file of provenance.watchFiles) options.watch(file);
			for (const file of provenance.watchFiles) this.#authorizationInputs.add(path.resolve(file));
			const authorization = await this.#session.authorizeResolvedComponent(
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
			if (authorization.outcome === 'authorized') {
				for (const file of authorization.watchFiles) {
					options.watch(file);
					this.#authorizationInputs.add(path.resolve(file));
				}
				const facts = authorization.componentBuild;
				const record = Object.freeze({
					facts,
					version: sourceVersion(JSON.stringify(facts)),
					source: 'published' as const
				});
				this.#facts.set(exactModuleFilename(facts.filename), record);
				await this.preflightPublishedEdges(facts, options);
			}
			const result =
				authorization.outcome === 'omitted'
					? `${omittedEnhancementPrefix}${encodeURIComponent(authorization.enhancementIdentity)}`
					: resolved;
			this.#preflighted.set(
				preflightKey,
				typeof result === 'string' && result.startsWith(omittedEnhancementPrefix) ? result : ''
			);
			this.#pendingCandidates.set(
				preflightKey,
				Object.freeze({
					resolvedModuleId,
					source,
					importerModuleId,
					...(options.executionReason ? { executionReason: options.executionReason } : {})
				})
			);
			return result;
		} catch (error) {
			this.#preflighted.delete(preflightKey);
			throw error;
		}
	}

	/** Commits the current generation and returns its immutable authorization artifacts. */
	async commit(): Promise<
		Awaited<ReturnType<ExactComponentAuthorizationSession['commitGeneration']>> | undefined
	> {
		if (!this.#session) return undefined;
		const committed = await this.#session.commitGeneration();
		this.#acceptedCandidates.clear();
		for (const [key, candidate] of this.#pendingCandidates)
			this.#acceptedCandidates.set(key, candidate);
		this.#pendingCandidates.clear();
		return committed;
	}

	/** Reauthorizes the last committed graph before one development generation can replace it. */
	async revalidate(
		options: Parameters<ExactViteComponentAuthorization['authorize']>[3],
		excludedImporter?: string
	): Promise<void> {
		const excluded = excludedImporter ? exactModuleFilename(excludedImporter) : undefined;
		for (const candidate of this.#acceptedCandidates.values()) {
			if (excluded && exactModuleFilename(candidate.importerModuleId) === excluded) continue;
			await this.authorize(
				candidate.resolvedModuleId,
				candidate.source,
				candidate.importerModuleId,
				{
					...options,
					...(candidate.executionReason ? { executionReason: candidate.executionReason } : {})
				}
			);
		}
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
		this.#facts.clear();
		this.#preflighted.clear();
		this.#pendingCandidates.clear();
		this.#acceptedCandidates.clear();
		this.#authorizationInputs.clear();
	}

	private async preflightPublishedEdges(
		facts: ExactComponentBuildFacts,
		options: Parameters<ExactViteComponentAuthorization['authorize']>[3]
	): Promise<void> {
		for (const edge of facts.componentImports) {
			if (!edge.artifactTargets.includes('server')) continue;
			await this.authorize(edge.moduleSpecifier, edge.moduleSpecifier, facts.filename, {
				...options,
				executionReason: serverReason(edge.reason)
			});
		}
		for (const enhancement of facts.rendererEnhancements) {
			await this.authorize(
				enhancement.moduleSpecifier,
				enhancement.moduleSpecifier,
				facts.filename,
				{ ...options, executionReason: 'server-enhancement' }
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
