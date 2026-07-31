import {
	createExactBuildInspectionCatalog,
	createCompilerSession,
	createExactInspectionBuildKey,
	createExactInspectionRedactions,
	resolveNativeCompilerExecutable,
	type ExactCompilerManifest,
	type ExactCompilerSession,
	type ExactCompilerSessionOptions,
	type ExactSourceInspection
} from '@exactjs/compiler';
import type {
	ExactBuildInspectionCatalog,
	ExactInspectionRedactionCatalog
} from '@exactjs/devtools-protocol';
import path from 'node:path';

const sessions = new Map<string, ExactCompilerSession>();
const inspectionModules = new Map<string, Map<string, ExactWebpackInspectionModule>>();
let nextSessionId = 0;

type ExactWebpackInspectionModule = Readonly<{
	inspection: ExactSourceInspection;
	manifest: ExactCompilerManifest;
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
	return session;
}

/** Releases webpack compiler session and its owned resources. */
export function disposeWebpackCompilerSession(id: string): void {
	sessions.get(id)?.dispose();
	sessions.delete(id);
	inspectionModules.delete(id);
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
		manifest: ExactCompilerManifest;
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
				redactions: createExactInspectionRedactions(
					[...modules.values()].map((entry) => entry.manifest),
					options.redactions ?? configured?.redactions
				)
			}
		]
	});
}
