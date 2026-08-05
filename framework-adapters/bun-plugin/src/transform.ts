import {
	createLineSourceMap,
	type ExactCompilerSession,
	type ExactComponentBuildFacts,
	type ExactSourceInspection
} from '@exactjs/compiler';
import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';
import {
	prependExactEnhancementRegistrations,
	transformExactAdapterModule
} from '@exactjs/compiler/adapter-support';
import {
	createReactCompatibilityBuildEngine,
	type ReactCompatibilityBuildEngine
} from '@exactjs/react-compat/build';
import { jsxSourceOwnership, resolveReactCompatibility } from '@exactjs/react-compat/plugin';
import { transformReactJsx, usesReactRuntimeImports } from '@exactjs/react-compat/transform';
import { appendBunDevtoolsBootstrap, bunDebugEnabled } from './devtools.js';
import type { ExactBunPluginOptions } from './plugin.js';
import { shouldTransform, targetFor } from './selection.js';

const compatibilityEngines = new WeakMap<
	ExactCompilerSession,
	Map<string, ReactCompatibilityBuildEngine>
>();

/** Transforms one Bun-loaded source file when it matches eXact plugin filters. */
export function transformExactBunSource(
	source: string,
	filename: string,
	options: ExactBunPluginOptions = {},
	session?: ExactCompilerSession
): {
	code: string;
	map: unknown;
	inspection?: Readonly<{
		inspection: ExactSourceInspection;
		redactions?: ExactInspectionRedactionCatalog;
	}>;
	componentBuild?: ExactComponentBuildFacts;
} | null {
	if (!shouldTransform(filename, source, options)) return null;
	let componentBuild: ExactComponentBuildFacts | undefined;
	const reactCompatibility = resolveReactCompatibility(options.reactCompatibility);
	const compatibilityEngine = reactCompatibility
		? compatibilityEngineFor(options, session, reactCompatibility.target)
		: undefined;
	const ownership = jsxSourceOwnership(filename, source, reactCompatibility);
	const output = transformExactAdapterModule({
		source,
		filename,
		jsxOwnership: ownership,
		usesReactRuntimeImports: usesReactRuntimeImports(source, filename),
		transformReact: true,
		shouldCompile: true,
		invalidateCompatibility: () => compatibilityEngine?.invalidate(filename),
		...(reactCompatibility
			? {
					react: () =>
						transformReactJsx(source, {
							filename,
							target: reactCompatibility.target,
							sourceMap: options.sourceMap ?? true
						})
				}
			: {}),
		compiler: {
			options: {
				session,
				target: targetFor(options),
				serverComponents: options.serverComponents,
				sourceMap: options.sourceMap ?? true,
				assetRules: options.assetRules,
				preserveClientAssetImports: true,
				jsxInterop: compatibilityEngine?.jsxInterop,
				emitInspection: options.target === 'server' && bunDebugEnabled(options.debug?.catalog),
				instrumentInspection: bunDebugEnabled(options.debug?.runtime)
			},
			finish: (result) => {
				componentBuild = result.componentBuild;
				const enhanced = prependExactEnhancementRegistrations(
					result.code,
					result.rendererEnhancements
				);
				const code =
					options.target !== 'server' && bunDebugEnabled(options.debug?.runtime)
						? appendBunDevtoolsBootstrap(enhanced, options.debug)
						: enhanced;
				return {
					code,
					map: options.sourceMap === false ? null : createLineSourceMap(filename, source, code)
				};
			},
			inspection: (result) =>
				result.inspectionCatalog
					? {
							inspection: result.inspectionCatalog,
							redactions: result.inspectionRedactions
						}
					: undefined
		},
		profile: options.onProfile
			? { subsystem: 'bun-plugin' as const, sink: options.onProfile }
			: undefined
	});
	return output
		? {
				code: output.code,
				map: output.map,
				inspection: output.inspection,
				...(componentBuild ? { componentBuild } : {})
			}
		: null;
}

function compatibilityEngineFor(
	options: ExactBunPluginOptions,
	session: ExactCompilerSession | undefined,
	target: 18 | 19
): ReactCompatibilityBuildEngine {
	const configured =
		typeof options.reactCompatibility === 'object'
			? options.reactCompatibility
			: { target, cwd: options.applicationRoot ?? process.cwd() };
	if (!session) return createReactCompatibilityBuildEngine(configured);
	const key = JSON.stringify([
		target,
		configured.cwd ?? '',
		configured.source instanceof RegExp
			? [configured.source.source, configured.source.flags]
			: (configured.source ?? '')
	]);
	let engines = compatibilityEngines.get(session);
	if (!engines) {
		engines = new Map();
		compatibilityEngines.set(session, engines);
	}
	let engine = engines.get(key);
	if (!engine) {
		engine = createReactCompatibilityBuildEngine(configured);
		engines.set(key, engine);
	}
	return engine;
}
