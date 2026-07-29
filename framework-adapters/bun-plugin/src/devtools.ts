import {
	createExactBuildInspectionCatalog,
	createExactInspectionBuildKey,
	createExactInspectionRedactions,
	type ExactCompilerManifest,
	type ExactSourceInspection
} from '@exactjs/compiler';
import path from 'node:path';
import type { ExactBunDebugOptions, ExactBunPluginOptions } from './plugin.js';

/** Compiler output retained only until one Bun server catalog is emitted. */
export type ExactBunInspectionModule = Readonly<{
	inspection: ExactSourceInspection;
	manifest: ExactCompilerManifest;
	source: string;
}>;

/** Resolves an individual compiler control outside adapter build lifecycle. */
export function bunDebugEnabled(value: boolean | 'auto' | undefined): boolean {
	return (
		value === true ||
		((value === undefined || value === 'auto') && process.env.NODE_ENV !== 'production')
	);
}

/** Resolves Bun's independent catalog and runtime controls for one build. */
export function resolveBunDebug(
	debug: ExactBunDebugOptions | undefined,
	development: boolean
): ExactBunDebugOptions {
	return {
		...debug,
		catalog:
			debug?.catalog === 'auto' || debug?.catalog === undefined ? development : debug.catalog,
		runtime:
			debug?.runtime === 'auto' || debug?.runtime === undefined ? development : debug.runtime,
		...(development && !debug?.buildKey ? { buildKey: 'development' } : {})
	};
}

/** Appends the guarded client runtime installation to one compiled module. */
export function appendBunDevtoolsBootstrap(
	code: string,
	debug: ExactBunDebugOptions | undefined
): string {
	let local = '__exactInstallDevtoolsRuntime';
	while (code.includes(local)) local += '_';
	return `${code}
import { installExactDevtoolsRuntime as ${local} } from '@exactjs/devtools-runtime';
globalThis[Symbol.for('@exactjs/devtools-installation')] ??= ${local}(${JSON.stringify({
		buildKey: debug?.buildKey ?? 'development',
		executionRoot: debug?.executionRoot ?? debug?.rootComponentId ?? 'page',
		...(debug?.redactions ? { redactions: debug.redactions } : {})
	})});
`;
}

/** Creates the server-only catalog owned by one Bun build. */
export function createBunInspectionCatalog(
	options: ExactBunPluginOptions,
	debug: ExactBunDebugOptions,
	modules: ReadonlyMap<string, ExactBunInspectionModule>
) {
	if (!modules.size) return undefined;
	const root = path.resolve(options.applicationRoot ?? process.cwd());
	const entries = [...modules.entries()].map(([filename, entry]) => ({
		filename,
		source: entry.source
	}));
	const inspections = [...modules.values()].map((entry) => entry.inspection);
	const rootComponentId =
		debug.rootComponentId ?? inspections.flatMap((inspection) => inspection.components)[0]?.id;
	if (!rootComponentId) return undefined;
	const buildKey = debug.buildKey ?? createExactInspectionBuildKey(root, entries);
	return createExactBuildInspectionCatalog({
		buildKey,
		root,
		...(debug.producer ? { producer: debug.producer } : {}),
		roots: [
			{
				executionRoot: debug.executionRoot ?? rootComponentId,
				rootComponentId,
				inspections,
				sources: Object.fromEntries(
					[...modules.entries()].map(([filename, entry]) => [filename, entry.source])
				),
				redactions: createExactInspectionRedactions(
					[...modules.values()].map((entry) => entry.manifest),
					debug.redactions
				)
			}
		]
	});
}
