import { createLineSourceMap, type ExactCompilerSession } from '@exactjs/compiler';
import {
	prependExactEnhancementRegistrations,
	transformExactAdapterModule
} from '@exactjs/compiler/adapter-support';
import type { IntlBuildCoordinator } from '@exactjs/intl-build';
import { jsxSourceOwnership, resolveReactCompatibility } from '@exactjs/react-compat/plugin';
import { transformReactJsx, usesReactRuntimeImports } from '@exactjs/react-compat/transform';
import { appendWebpackDevtoolsBootstrap, webpackDebugEnabled } from './devtools.js';
import type { ExactWebpackPluginOptions } from './plugin.js';
import { webpackCompatibilityEngine } from './react-compatibility.js';
import { shouldTransformWebpackModule, webpackTransformTarget } from './transform-selection.js';
import { materializeWebpackEnhancementFacades } from './enhancement-facades.js';

/** Compiler output retained for the owning plugin or cross-module loader bridge. */
export type ExactWebpackTransformResult = Readonly<{
	code: string;
	map: unknown;
	componentBuild?: import('@exactjs/compiler').ExactComponentBuildFacts;
	languageProjection?: import('@exactjs/language-extension-api').ExactLanguageProjectionV1;
	inspection?: Readonly<{
		inspection: import('@exactjs/compiler').ExactSourceInspection;
		redactions?: import('@exactjs/devtools-protocol').ExactInspectionRedactionCatalog;
		debug?: ExactWebpackPluginOptions['debug'];
	}>;
}>;

/** Transforms one webpack-loaded source file when it matches eXact plugin filters. */
export function transformExactWebpackModule(
	source: string,
	filename: string,
	options: ExactWebpackPluginOptions = {},
	session?: ExactCompilerSession,
	intl?: IntlBuildCoordinator,
	warn?: (message: string) => void
): ExactWebpackTransformResult | null {
	const reachedPublication =
		intl && options.internationalization ? intl.activateReachedSource(source, filename) : undefined;
	if (!shouldTransformWebpackModule(filename, source, options))
		return reachedPublication
			? {
					code: reachedPublication.code,
					map:
						options.sourceMap === false
							? null
							: createLineSourceMap(filename, source, reachedPublication.code)
				}
			: null;
	let componentBuild: ExactWebpackTransformResult['componentBuild'] | undefined;
	const reactCompatibility = resolveReactCompatibility(options.reactCompatibility);
	const compatibilityEngine = reactCompatibility
		? webpackCompatibilityEngine(options, session, reactCompatibility.target)
		: undefined;
	const authoredOwnership = jsxSourceOwnership(filename, source, reactCompatibility);
	const intlAnalysis =
		intl && options.internationalization && authoredOwnership !== 'react'
			? intl.analyzeConfiguredSource(source, filename)
			: undefined;
	for (const diagnostic of intlAnalysis?.diagnostics ?? [])
		warn?.(`${diagnostic.file}:${diagnostic.start}: ${diagnostic.message}`);
	const analyzedSource = intlAnalysis?.code ?? source;
	const ownership = intlAnalysis
		? jsxSourceOwnership(filename, analyzedSource, reactCompatibility)
		: authoredOwnership;
	const output = transformExactAdapterModule({
		source: analyzedSource,
		filename,
		jsxOwnership: ownership,
		usesReactRuntimeImports: usesReactRuntimeImports(analyzedSource, filename),
		transformReact: true,
		shouldCompile: true,
		invalidateCompatibility: () => compatibilityEngine?.invalidate(filename),
		...(reactCompatibility
			? {
					react: () =>
						transformReactJsx(analyzedSource, {
							filename,
							target: reactCompatibility.target,
							sourceMap: options.sourceMap ?? true
						})
				}
			: {}),
		compiler: {
			options: {
				session,
				packageEnhancements: options.__exactPackageEnhancements,
				target: webpackTransformTarget(options),
				serverComponents: options.serverComponents,
				sourceMap: options.sourceMap ?? true,
				assetRules: options.assetRules,
				preserveClientAssetImports: true,
				jsxInterop: compatibilityEngine?.jsxInterop,
				emitInspection:
					options.__exactLanguageValidation === true ||
					(options.target === 'server' && webpackDebugEnabled(options.debug?.catalog)),
				instrumentInspection: webpackDebugEnabled(options.debug?.runtime)
			},
			finish: (result) => {
				componentBuild = result.componentBuild;
				if (intlAnalysis?.descriptors.length)
					intl?.linkDescriptorOwners(intlAnalysis, result.componentBuild.components, filename);
				const registered = prependExactEnhancementRegistrations(
					result.code,
					result.rendererEnhancements
				);
				const enhanced = materializeWebpackEnhancementFacades(
					registered,
					result.rendererEnhancements,
					filename,
					options.applicationRoot
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
	return output
		? {
				code: output.code,
				map: output.map,
				...(componentBuild ? { componentBuild } : {}),
				...(output.inspection
					? { languageProjection: output.inspection.inspection.languageProjection }
					: {}),
				...(output.inspection ? { inspection: output.inspection } : {})
			}
		: null;
}
