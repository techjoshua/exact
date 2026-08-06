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

/** Owns Vite's build-scoped compiler facts and replaceable authorization generation. */
export class ExactViteComponentAuthorization {
	readonly #facts = new Map<string, ExactViteComponentFactRecord>();
	readonly #preflighted = new Map<string, string | null>();
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
			return result;
		} catch (error) {
			this.#preflighted.delete(preflightKey);
			throw error;
		}
	}

	/** Commits the current generation and returns its immutable authorization artifacts. */
	commit(): ReturnType<ExactComponentAuthorizationSession['commitGeneration']> | undefined {
		return this.#session?.commitGeneration();
	}

	/** Rejects the current generation without discarding reusable compiler facts. */
	reject(): void {
		this.#session?.rejectGeneration();
	}

	/** Releases the generation and all retained compiler facts. */
	dispose(): void {
		this.#session?.dispose();
		this.#session = undefined;
		this.#facts.clear();
		this.#preflighted.clear();
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
