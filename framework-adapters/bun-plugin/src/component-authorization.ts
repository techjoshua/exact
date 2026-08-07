import type { ExactComponentBuildFacts } from '@exactjs/compiler';
import {
	createExactComponentAuthorizationSession,
	recordExactNodeComponentProvenance,
	type ExactComponentAuthorizationSession,
	type ExactResolvedComponentCandidate
} from '@exactjs/component-library-policy';
import { loadExactConfig } from '@exactjs/config/node';
import type { ExactLoadedConfig } from '@exactjs/config/node';
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
		Readonly<{
			facts: ExactComponentBuildFacts;
			version: string;
			source: 'compiler' | 'published';
		}>
	>();
	readonly #preflighted = new Map<string, Readonly<{ path: string; namespace?: string }> | null>();
	#session?: ExactComponentAuthorizationSession;

	constructor(options: Readonly<{ applicationRoot?: string; buildKey?: string }>) {
		this.#applicationRoot = path.resolve(options.applicationRoot ?? process.cwd());
		this.#buildKey =
			options.buildKey ??
			`bun-${createHash('sha256').update(this.#applicationRoot).digest('base64url')}`;
	}

	/** Opens a clean authorization generation before Bun resolves candidate modules. */
	async start(configPath?: string): Promise<void> {
		const loaded = await loadExactConfig({
			applicationRoot: this.#applicationRoot,
			configPath
		});
		this.startLoaded(loaded);
	}

	/** Opens a generation from the same neutral config load supplied to the plugin host. */
	startLoaded(loaded: ExactLoadedConfig): void {
		this.#session?.rejectGeneration();
		this.#session?.dispose();
		this.#facts.clear();
		this.#preflighted.clear();
		this.#session = createExactComponentAuthorizationSession({
			buildKey: this.#buildKey,
			config: loaded.config?.componentLibraries
		});
	}

	/** Retains compiler facts for the active generation without retaining authored source. */
	record(filename: string, source: string, facts: ExactComponentBuildFacts): void {
		const moduleId = facts.filename;
		if (
			this.#facts.get(moduleId)?.source === 'published' ||
			this.#facts.get(path.resolve(filename))?.source === 'published'
		)
			return;
		const version = createHash('sha256').update(source).digest('base64url');
		const record = Object.freeze({ facts, version, source: 'compiler' as const });
		this.#facts.set(moduleId, record);
		this.#facts.set(path.resolve(filename), record);
		this.#session?.recordImporterFacts(moduleId, facts, version);
	}

	/** Resolves and authorizes an eXact component edge before Bun invokes candidate onLoad hooks. */
	async authorize(
		request: string,
		importerModuleId: string,
		resolve?: ExactBunResolver,
		aliases?: Readonly<Record<string, string>>
	): Promise<Readonly<{ path: string; namespace?: string }> | undefined> {
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
		const preflightKey = [
			importerId,
			request,
			componentEdge?.exportName ?? enhancement!.exportName
		].join('\0');
		if (this.#preflighted.has(preflightKey))
			return this.#preflighted.get(preflightKey) ?? undefined;
		this.#preflighted.set(preflightKey, null);
		try {
			const resolvedModuleId = await resolveBunCandidate(request, importerId, resolve, aliases);
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
			const authorization = await this.#session.authorizeResolvedComponent(candidate);
			if (authorization.outcome === 'authorized') {
				const facts = authorization.componentBuild;
				const record = Object.freeze({
					facts,
					version: createHash('sha256').update(JSON.stringify(facts)).digest('base64url'),
					source: 'published' as const
				});
				this.#facts.set(facts.filename, record);
				this.#facts.set(path.resolve(facts.filename), record);
				for (const edge of facts.componentImports) {
					if (edge.artifactTargets.includes('server'))
						await this.authorize(edge.moduleSpecifier, facts.filename, resolve, aliases);
				}
				for (const nested of facts.rendererEnhancements)
					await this.authorize(nested.moduleSpecifier, facts.filename, resolve, aliases);
			}
			const result =
				authorization.outcome === 'omitted'
					? Object.freeze({
							path: encodeURIComponent(authorization.enhancementIdentity),
							namespace: 'exact-omitted-enhancement'
						})
					: Object.freeze({ path: resolvedModuleId });
			this.#preflighted.set(preflightKey, result);
			return result;
		} catch (error) {
			this.#preflighted.delete(preflightKey);
			throw error;
		}
	}

	/** Commits the active generation and returns its private manifest products. */
	commit(): ReturnType<ExactComponentAuthorizationSession['commitGeneration']> | undefined {
		return this.#session?.commitGeneration();
	}

	/** Rejects a failed Bun build without retaining or emitting its partial decision graph. */
	reject(): void {
		this.#session?.rejectGeneration();
		this.#session?.dispose();
		this.#session = undefined;
		this.#facts.clear();
		this.#preflighted.clear();
	}

	/** Releases all generation state owned by this plugin instance. */
	dispose(): void {
		this.#session?.dispose();
		this.#session = undefined;
		this.#facts.clear();
		this.#preflighted.clear();
	}
}

async function resolveBunCandidate(
	request: string,
	importerId: string,
	resolve: ExactBunResolver | undefined,
	aliases: Readonly<Record<string, string>> | undefined
): Promise<string> {
	if (resolve)
		try {
			return (
				await resolve(request, {
					kind: 'import-statement',
					resolveDir: path.dirname(importerId)
				})
			).path;
		} catch (error) {
			if (!isUnavailableBunResolver(error)) throw error;
		}
	return createRequire(importerId).resolve(aliases?.[request] ?? request);
}

function isUnavailableBunResolver(error: unknown): boolean {
	return error instanceof Error && error.message.includes('build.resolve() is not implemented yet');
}

function bunServerReason(
	reason: ExactComponentBuildFacts['componentImports'][number]['reason']
): ExactResolvedComponentCandidate['reason'] {
	if (reason === 'enhancement') return 'server-enhancement';
	if (reason === 'task-owner') return 'server-task';
	if (reason === 'continuation') return 'server-component';
	return 'ssr';
}
