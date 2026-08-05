import {
	createExactBuildInspectionCatalog,
	createCompilerSession,
	createExactInspectionBuildKey,
	resolveNativeCompilerExecutable,
	type ExactCompilerSession,
	type ExactCompilerSessionOptions,
	type ExactSourceInspection
} from '@exactjs/compiler';
import type { ExactComponentBuildFacts } from '@exactjs/compiler';
import {
	createExactComponentAuthorizationSession,
	recordExactNodeComponentProvenance,
	type ExactComponentAuthorizationSession,
	type ExactResolvedComponentCandidate
} from '@exactjs/component-library-policy';
import { loadExactConfig } from '@exactjs/config/node';
import { createHash } from 'node:crypto';
import type {
	ExactBuildInspectionCatalog,
	ExactInspectionRedactionCatalog
} from '@exactjs/devtools-protocol';
import path from 'node:path';

const sessions = new Map<string, ExactCompilerSession>();
const inspectionModules = new Map<string, Map<string, ExactWebpackInspectionModule>>();
const componentFacts = new Map<
	string,
	Map<string, Readonly<{ facts: ExactComponentBuildFacts; version: string }>>
>();
const authorizations = new Map<string, WebpackAuthorizationGeneration>();
let nextSessionId = 0;

type ExactWebpackInspectionModule = Readonly<{
	inspection: ExactSourceInspection;
	redactions?: ExactInspectionRedactionCatalog;
	source: string;
	debug?: Readonly<{
		buildKey?: string;
		executionRoot?: string;
		rootComponentId?: string;
		producer?: Readonly<{ packageName?: string; version?: string }>;
		redactions?: Partial<ExactInspectionRedactionCatalog>;
	}>;
}>;

/** Creates a webpack compiler session. */
export function createWebpackCompilerSession(
	_enabled: boolean,
	onProfile?: ExactCompilerSessionOptions['onProfile']
): Readonly<{
	id: string;
	session: ExactCompilerSession;
}> {
	const id = `exact-webpack-${++nextSessionId}`;
	const session = createCompilerSession({
		nativeCompiler: { executable: resolveNativeCompilerExecutable() },
		onProfile
	});
	sessions.set(id, session);
	inspectionModules.set(id, new Map());
	componentFacts.set(id, new Map());
	return { id, session };
}

/** Performs the webpack compiler session domain operation. */
export function webpackCompilerSession(id: string | undefined): ExactCompilerSession | undefined {
	return id ? sessions.get(id) : undefined;
}

/** Performs the replace webpack compiler session domain operation. */
export function replaceWebpackCompilerSession(
	id: string,
	_enabled: boolean,
	onProfile?: ExactCompilerSessionOptions['onProfile']
): ExactCompilerSession {
	sessions.get(id)?.dispose();
	const session = createCompilerSession({
		nativeCompiler: { executable: resolveNativeCompilerExecutable() },
		onProfile
	});
	sessions.set(id, session);
	inspectionModules.set(id, new Map());
	componentFacts.set(id, new Map());
	return session;
}

/** Releases webpack compiler session and its owned resources. */
export function disposeWebpackCompilerSession(id: string): void {
	sessions.get(id)?.dispose();
	sessions.delete(id);
	inspectionModules.delete(id);
	componentFacts.delete(id);
	authorizations.get(id)?.session?.dispose();
	authorizations.delete(id);
}

/** Performs the webpack compiler session count domain operation. */
export function webpackCompilerSessionCount(): number {
	return sessions.size;
}

/** Retains one compiler result until Webpack's server asset phase. */
export function recordWebpackInspectionModule(
	id: string | undefined,
	filename: string,
	source: string,
	entry: Readonly<{
		inspection: ExactSourceInspection;
		redactions?: ExactInspectionRedactionCatalog;
		debug?: ExactWebpackInspectionModule['debug'];
	}>
): void {
	if (!id) return;
	inspectionModules.get(id)?.set(path.resolve(filename), { ...entry, source });
}

/** Starts a fresh catalog collection for the next Webpack compilation. */
export function clearWebpackInspectionModules(id: string): void {
	inspectionModules.get(id)?.clear();
}

/** Records compiler component facts before Webpack discovers the importer's dependency modules. */
export function recordWebpackComponentBuildFacts(
	id: string | undefined,
	filename: string,
	source: string,
	facts: ExactComponentBuildFacts
): void {
	if (!id) return;
	const version = createHash('sha256').update(source).digest('base64url');
	componentFacts.get(id)?.set(path.resolve(filename), Object.freeze({ facts, version }));
	const authorization = authorizations.get(id)?.session;
	if (authorization) authorization.recordImporterFacts(path.resolve(filename), facts, version);
}

/** Options needed to open a Webpack authorization generation lazily from resolver hooks. */
export type ExactWebpackAuthorizationOptions = Readonly<{
	target?: string;
	applicationRoot?: string;
	configPath?: string;
	buildKey?: string;
}>;

/** Rejects the pending Webpack generation while retaining no failed graph history. */
export function resetWebpackAuthorizationGeneration(
	id: string,
	options: ExactWebpackAuthorizationOptions
): void {
	authorizations.get(id)?.session?.rejectGeneration();
	authorizations.delete(id);
	componentFacts.get(id)?.clear();
	if (options.target === 'server') authorizations.set(id, { options });
}

/** Authorizes one NormalModuleFactory resolution before Webpack builds the candidate module. */
export async function authorizeWebpackResolvedComponent(
	id: string,
	options: ExactWebpackAuthorizationOptions,
	request: string,
	importerModuleId: string,
	resolvedModuleId: string
): Promise<'authorized' | 'omitted' | undefined> {
	if (options.target !== 'server') return;
	const importerPath = webpackIssuerResource(importerModuleId);
	const importer = componentFacts.get(id)?.get(importerPath);
	if (!importer) return;
	const componentEdge = importer.facts.componentImports.find(
		(edge) => edge.moduleSpecifier === request && edge.artifactTargets.includes('server')
	);
	const enhancement = importer.facts.rendererEnhancements.find(
		(edge) => edge.moduleSpecifier === request
	);
	if (!componentEdge && !enhancement) return;
	const generation = await webpackAuthorizationGeneration(id, options);
	const provenance = await recordExactNodeComponentProvenance({
		session: generation.session!,
		applicationRoot: generation.applicationRoot!,
		importerModuleId: importerPath,
		moduleSpecifier: request,
		resolvedModuleId
	});
	const candidate: ExactResolvedComponentCandidate = {
		importerModuleId: importerPath,
		moduleSpecifier: request,
		exportName: componentEdge?.exportName ?? enhancement!.exportName,
		resolvedModuleId,
		packageInstanceKey: provenance.instance.key,
		reason: enhancement ? 'server-enhancement' : webpackServerReason(componentEdge!.reason),
		...(enhancement ? { optionalEnhancementIdentity: enhancement.identity } : {})
	};
	const authorization = await generation.session!.authorizeResolvedComponent(candidate);
	return authorization.outcome;
}

/** Maps Webpack's loader-prefixed issuer identity back to the importer resource recorded by the pre-loader. */
function webpackIssuerResource(issuer: string): string {
	const resource = issuer.slice(issuer.lastIndexOf('!') + 1).split('?', 1)[0] ?? issuer;
	return path.resolve(resource);
}

/** Commits and returns the pending Webpack authorization manifests for processAssets. */
export async function commitWebpackAuthorizationGeneration(
	id: string,
	options: ExactWebpackAuthorizationOptions
): Promise<
	Awaited<ReturnType<ExactComponentAuthorizationSession['commitGeneration']>> | undefined
> {
	if (options.target !== 'server') return undefined;
	const generation = await webpackAuthorizationGeneration(id, options);
	return generation.session!.commitGeneration();
}

type WebpackAuthorizationGeneration = {
	options: ExactWebpackAuthorizationOptions;
	preparing?: Promise<void>;
	session?: ExactComponentAuthorizationSession;
	applicationRoot?: string;
};

async function webpackAuthorizationGeneration(
	id: string,
	options: ExactWebpackAuthorizationOptions
): Promise<WebpackAuthorizationGeneration> {
	let generation = authorizations.get(id);
	if (!generation) {
		generation = { options };
		authorizations.set(id, generation);
	}
	if (!generation.preparing && !generation.session) {
		generation.preparing = (async () => {
			const applicationRoot = path.resolve(options.applicationRoot ?? process.cwd());
			const loaded = await loadExactConfig({ applicationRoot, configPath: options.configPath });
			generation!.applicationRoot = applicationRoot;
			generation!.session = createExactComponentAuthorizationSession({
				buildKey:
					options.buildKey ??
					`webpack-${createHash('sha256').update(applicationRoot).digest('base64url')}`,
				config: loaded.config?.componentLibraries
			});
			for (const [moduleId, record] of componentFacts.get(id) ?? [])
				generation!.session.recordImporterFacts(moduleId, record.facts, record.version);
		})();
	}
	await generation.preparing;
	return generation;
}

function webpackServerReason(
	reason: ExactComponentBuildFacts['componentImports'][number]['reason']
): ExactResolvedComponentCandidate['reason'] {
	if (reason === 'enhancement') return 'server-enhancement';
	if (reason === 'task-owner') return 'server-task';
	if (reason === 'continuation') return 'server-component';
	return 'ssr';
}

/** Creates the one server-only catalog owned by a Webpack compilation. */
export function webpackInspectionCatalog(
	id: string,
	options: Readonly<{
		applicationRoot?: string;
		buildKey?: string;
		executionRoot?: string;
		rootComponentId?: string;
		producer?: Readonly<{ packageName?: string; version?: string }>;
		redactions?: Partial<ExactInspectionRedactionCatalog>;
	}>
): ExactBuildInspectionCatalog | undefined {
	const modules = inspectionModules.get(id);
	if (!modules?.size) return undefined;
	const configured = modules.values().next().value?.debug;
	const root = path.resolve(options.applicationRoot ?? process.cwd());
	const entries = [...modules.entries()].map(([filename, entry]) => ({
		filename,
		source: entry.source
	}));
	const inspections = [...modules.values()].map((entry) => entry.inspection);
	const rootComponentId =
		options.rootComponentId ??
		configured?.rootComponentId ??
		inspections.flatMap((inspection) => inspection.components)[0]?.id;
	if (!rootComponentId) return undefined;
	const buildKey =
		options.buildKey ?? configured?.buildKey ?? createExactInspectionBuildKey(root, entries);
	return createExactBuildInspectionCatalog({
		buildKey,
		root,
		...((options.producer ?? configured?.producer)
			? { producer: options.producer ?? configured?.producer }
			: {}),
		roots: [
			{
				executionRoot: options.executionRoot ?? configured?.executionRoot ?? rootComponentId,
				rootComponentId,
				inspections,
				sources: Object.fromEntries(
					[...modules.entries()].map(([filename, entry]) => [filename, entry.source])
				),
				redactions: mergeInspectionRedactions(
					[...modules.values()].flatMap((entry) => entry.redactions ?? []),
					options.redactions ?? configured?.redactions
				)
			}
		]
	});
}

function mergeInspectionRedactions(
	generated: readonly ExactInspectionRedactionCatalog[],
	configured: Partial<ExactInspectionRedactionCatalog> = {}
): ExactInspectionRedactionCatalog {
	return {
		statePaths: [
			...new Set([
				...generated.flatMap((value) => value.statePaths),
				...(configured.statePaths ?? [])
			])
		].sort(),
		contextTokens: [
			...generated.flatMap((value) => value.contextTokens),
			...(configured.contextTokens ?? [])
		],
		secretNames: [
			...new Set([
				...generated.flatMap((value) => value.secretNames),
				...(configured.secretNames ?? [])
			])
		].sort()
	};
}
