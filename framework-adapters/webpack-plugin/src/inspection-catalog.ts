import {
	createExactBuildInspectionCatalog,
	createExactInspectionBuildKey,
	type ExactSourceInspection
} from '@exactjs/compiler';
import {
	mergeInspectionRedactions,
	type ExactBuildInspectionCatalog,
	type ExactInspectionRedactionCatalog
} from '@exactjs/devtools-protocol';
import type { ExactComponentAuthorizationAudit } from '@exactjs/component-library-policy';
import path from 'node:path';

const inspectionModules = new Map<string, Map<string, ExactWebpackInspectionModule>>();

/** Opens an empty inspection collection for a compiler session or replacement generation. */
export function initializeWebpackInspectionModules(id: string): void {
	inspectionModules.set(id, new Map());
}

/** Releases all sources and inspection records owned by a compiler session. */
export function disposeWebpackInspectionModules(id: string): void {
	inspectionModules.delete(id);
}

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
		componentAuthorization?: ExactComponentAuthorizationAudit;
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
		options.buildKey ??
		configured?.buildKey ??
		options.componentAuthorization?.buildKey ??
		createExactInspectionBuildKey(root, entries);
	const catalog = createExactBuildInspectionCatalog({
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
	if (
		options.componentAuthorization &&
		options.componentAuthorization.buildKey !== catalog.buildKey
	)
		throw new Error('Component authorization and Webpack inspection build keys do not match');
	return options.componentAuthorization
		? Object.freeze({ ...catalog, componentAuthorization: options.componentAuthorization })
		: catalog;
}
