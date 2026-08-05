import { createLineSourceMap, type ExactCompilerSession } from '@exactjs/compiler';
import {
	prependExactEnhancementRegistrations,
	transformExactAdapterModule
} from '@exactjs/compiler/adapter-support';
import { jsxSourceOwnership, resolveReactCompatibility } from '@exactjs/react-compat/plugin';
import { transformReactJsx, usesReactRuntimeImports } from '@exactjs/react-compat/transform';
import { appendWebpackDevtoolsBootstrap, webpackDebugEnabled } from './devtools.js';
import type { ExactWebpackPluginOptions } from './plugin.js';
import { webpackCompatibilityEngine } from './react-compatibility.js';
import { recordWebpackComponentBuildFacts, recordWebpackInspectionModule } from './sessions.js';
import { shouldTransformWebpackModule, webpackTransformTarget } from './transform-selection.js';

/** Transforms one webpack-loaded source file when it matches eXact plugin filters. */
export function transformExactWebpackModule(
	source: string,
	filename: string,
	options: ExactWebpackPluginOptions = {},
	session?: ExactCompilerSession
): { code: string; map: unknown } | null {
	if (!shouldTransformWebpackModule(filename, source, options)) return null;
	const reactCompatibility = resolveReactCompatibility(options.reactCompatibility);
	const compatibilityEngine = reactCompatibility
		? webpackCompatibilityEngine(options, session, reactCompatibility.target)
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
				target: webpackTransformTarget(options),
				serverComponents: options.serverComponents,
				sourceMap: options.sourceMap ?? true,
				assetRules: options.assetRules,
				preserveClientAssetImports: true,
				jsxInterop: compatibilityEngine?.jsxInterop,
				emitInspection: options.target === 'server' && webpackDebugEnabled(options.debug?.catalog),
				instrumentInspection: webpackDebugEnabled(options.debug?.runtime)
			},
			finish: (result) => {
				recordWebpackComponentBuildFacts(
					options.__exactSessionId,
					filename,
					source,
					result.componentBuild
				);
				const enhanced = prependExactEnhancementRegistrations(
					result.code,
					result.rendererEnhancements
				);
				const code =
					options.target !== 'server' && webpackDebugEnabled(options.debug?.runtime)
						? appendWebpackDevtoolsBootstrap(enhanced, options.debug)
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
							redactions: result.inspectionRedactions,
							debug: options.debug
						}
					: undefined
		},
		profile: options.onProfile
			? { subsystem: 'webpack-plugin' as const, sink: options.onProfile }
			: undefined
	});
	if (output?.inspection)
		recordWebpackInspectionModule(options.__exactSessionId, filename, source, output.inspection);
	return output ? { code: output.code, map: output.map } : null;
}
