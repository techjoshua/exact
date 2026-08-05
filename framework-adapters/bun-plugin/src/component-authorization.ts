import type { ExactComponentBuildFacts } from '@exactjs/compiler';
import {
	createExactComponentAuthorizationSession,
	recordExactNodeComponentProvenance,
	type ExactComponentAuthorizationSession,
	type ExactResolvedComponentCandidate
} from '@exactjs/component-library-policy';
import { loadExactConfig } from '@exactjs/config/node';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

/** Resolver capability exposed by Bun's build plugin API. */
export type ExactBunResolver = (
	request: string,
	options: Readonly<{ kind: 'import-statement'; resolveDir: string }>
) => Promise<Readonly<{ path: string }>>;

/** Build-scoped Bun authorization state, discarded after each build or watch generation. */
export class ExactBunComponentAuthorization {
	readonly #applicationRoot: string;
	readonly #buildKey: string;
	readonly #facts = new Map<
		string,
		Readonly<{ facts: ExactComponentBuildFacts; version: string }>
	>();
	#session?: ExactComponentAuthorizationSession;

	constructor(options: Readonly<{ applicationRoot?: string; buildKey?: string }>) {
		this.#applicationRoot = path.resolve(options.applicationRoot ?? process.cwd());
		this.#buildKey =
			options.buildKey ??
			`bun-${createHash('sha256').update(this.#applicationRoot).digest('base64url')}`;
	}

	/** Opens a clean authorization generation before Bun resolves candidate modules. */
	async start(configPath?: string): Promise<void> {
		this.#session?.rejectGeneration();
		this.#session?.dispose();
		this.#facts.clear();
		const loaded = await loadExactConfig({
			applicationRoot: this.#applicationRoot,
			configPath
		});
		this.#session = createExactComponentAuthorizationSession({
			buildKey: this.#buildKey,
			config: loaded.config?.componentLibraries
		});
	}

	/** Retains compiler facts for the active generation without retaining authored source. */
	record(filename: string, source: string, facts: ExactComponentBuildFacts): void {
		const moduleId = facts.filename;
		const version = createHash('sha256').update(source).digest('base64url');
		this.#facts.set(moduleId, Object.freeze({ facts, version }));
		this.#facts.set(path.resolve(filename), Object.freeze({ facts, version }));
		this.#session?.recordImporterFacts(moduleId, facts, version);
	}

	/** Resolves and authorizes an eXact component edge before Bun invokes candidate onLoad hooks. */
	async authorize(
		request: string,
		importerModuleId: string,
		resolve?: ExactBunResolver
	): Promise<Readonly<{ path: string }> | undefined> {
		const importer =
			this.#facts.get(importerModuleId) ?? this.#facts.get(path.resolve(importerModuleId));
		if (!importer || !this.#session) return undefined;
		const importerId = importer.facts.filename;
		const componentEdge = importer.facts.componentImports.find(
			(edge) => edge.moduleSpecifier === request && edge.artifactTargets.includes('server')
		);
		const enhancement = importer.facts.rendererEnhancements.find(
			(edge) => edge.moduleSpecifier === request
		);
		if (!componentEdge && !enhancement) return undefined;
		const resolvedModuleId = resolve
			? (
					await resolve(request, {
						kind: 'import-statement',
						resolveDir: path.dirname(importerId)
					})
				).path
			: createRequire(importerId).resolve(request);
		const provenance = await recordExactNodeComponentProvenance({
			session: this.#session,
			applicationRoot: this.#applicationRoot,
			importerModuleId: importerId,
			moduleSpecifier: request,
			resolvedModuleId
		});
		const candidate: ExactResolvedComponentCandidate = {
			importerModuleId: importerId,
			moduleSpecifier: request,
			exportName: componentEdge?.exportName ?? enhancement!.exportName,
			resolvedModuleId,
			packageInstanceKey: provenance.instance.key,
			reason: enhancement ? 'server-enhancement' : bunServerReason(componentEdge!.reason),
			...(enhancement ? { optionalEnhancementIdentity: enhancement.identity } : {})
		};
		await this.#session.authorizeResolvedComponent(candidate);
		return Object.freeze({ path: resolvedModuleId });
	}

	/** Commits the active generation and returns its private manifest products. */
	commit(): ReturnType<ExactComponentAuthorizationSession['commitGeneration']> | undefined {
		return this.#session?.commitGeneration();
	}

	/** Releases all generation state owned by this plugin instance. */
	dispose(): void {
		this.#session?.dispose();
		this.#session = undefined;
		this.#facts.clear();
	}
}

function bunServerReason(
	reason: ExactComponentBuildFacts['componentImports'][number]['reason']
): ExactResolvedComponentCandidate['reason'] {
	if (reason === 'enhancement') return 'server-enhancement';
	if (reason === 'task-owner') return 'server-task';
	if (reason === 'continuation') return 'server-component';
	return 'ssr';
}
