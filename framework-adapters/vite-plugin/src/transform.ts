import {
	createLineSourceMap,
	type ExactSourceInspection,
	type ExactCompilerSession
} from '@exactjs/compiler';
import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';
import type { ReactCompatibilityBuildEngine } from '@exactjs/react-compat/build';
import { jsxSourceOwnership, type ResolvedReactCompatibility } from '@exactjs/react-compat/plugin';
import { transformReactJsx, usesReactRuntimeImports } from '@exactjs/react-compat/transform';
import {
	containsExactBuildJsx,
	isExactBuildSourceModule,
	shouldCompileExactBuildModule,
	shouldTransformExactBuildModulePath,
	transformExactAdapterModule
} from '@exactjs/compiler/adapter-support';
import path from 'node:path';
import type { ExactViteComponentAuthorization } from './component-authorization.js';
import {
	inspectionCatalogEnabled,
	inspectionRuntimeEnabled,
	prependViteDevtoolsRuntimeImport
} from './debug-output.js';
import { prependViteEnhancementRegistrations } from './enhancement-catalog.js';
import { exactModuleFilename, exactTransformTarget } from './module-selection.js';
import type { ExactPluginOptions, ExactViteDebugOptions } from './plugin-contracts.js';
import { rewriteWithCompatibility } from './react-compatibility-emission.js';

/** Mutable build-owned inspection record collected for server catalog emission. */
export type ExactViteInspectionRecord = Readonly<{
	inspection: ExactSourceInspection;
	redactions?: ExactInspectionRedactionCatalog;
	source: string;
}>;

/** Inputs retained by the Vite plugin while transforming one source module. */
export type TransformExactViteModuleOptions = Readonly<{
	code: string;
	id: string;
	options: ExactPluginOptions;
	compilerSession: ExactCompilerSession;
	reactCompatibility?: ResolvedReactCompatibility;
	compatibilityEngine?: ReactCompatibilityBuildEngine;
	configuredDebug?: ExactViteDebugOptions;
	viteCommand: 'build' | 'serve';
	componentAuthorization: ExactViteComponentAuthorization;
	inspectionModules: Map<string, ExactViteInspectionRecord>;
	recordMicrofrontendModule(code: string, id: string): void;
	warn(message: string): void;
}>;

/** Runs the compiler/compatibility transform while projecting adapter-owned build metadata. */
export function transformExactViteModule(
	input: TransformExactViteModuleOptions
): { code: string; map: unknown; moduleType: 'js' } | null {
	const { code, id, options } = input;
	if (!isExactBuildSourceModule(id)) return null;
	const filename = exactModuleFilename(id);
	if (!shouldTransformExactBuildModulePath(filename, options)) return null;
	input.recordMicrofrontendModule(code, id);
	const ownership = jsxSourceOwnership(filename, code, input.reactCompatibility);
	const output = transformExactAdapterModule({
		source: code,
		filename,
		errorId: id,
		jsxOwnership: ownership,
		usesReactRuntimeImports: usesReactRuntimeImports(code, filename),
		transformReact: containsExactBuildJsx(filename, code),
		shouldCompile: shouldCompileExactBuildModule(filename, code, options),
		...(input.reactCompatibility
			? {
					react: () => {
						const lowered = transformReactJsx(code, {
							filename,
							target: input.reactCompatibility!.target,
							sourceMap: false
						});
						return rewriteWithCompatibility(
							input.compatibilityEngine!,
							lowered.code,
							filename,
							options.target,
							options.sourceMap,
							code
						);
					}
				}
			: {}),
		compiler: {
			options: {
				session: input.compilerSession,
				target: exactTransformTarget(options),
				serverComponents: options.serverComponents,
				sourceMap: false,
				assetRules: options.assetRules,
				preserveClientAssetImports: true,
				jsxInterop: input.compatibilityEngine?.jsxInterop,
				emitInspection:
					options.target === 'server' &&
					inspectionCatalogEnabled(input.configuredDebug, input.viteCommand),
				instrumentInspection: inspectionRuntimeEnabled(input.configuredDebug, input.viteCommand)
			},
			finish: (result) => {
				input.componentAuthorization.record(filename, result.componentBuild, code);
				const rewritten = input.compatibilityEngine
					? input.compatibilityEngine.transformModule({
							id: filename,
							source: result.code,
							format: 'module',
							target: options.target === 'server' ? 'server' : 'client',
							sourceMap: false
						})
					: { code: result.code };
				const enhanced = prependViteEnhancementRegistrations(
					rewritten.code,
					result.rendererEnhancements
				);
				const clientCode = prependViteDevtoolsRuntimeImport(
					enhanced,
					options.target !== 'server' &&
						inspectionRuntimeEnabled(input.configuredDebug, input.viteCommand)
				);
				return {
					code: clientCode,
					map: options.sourceMap === false ? null : createLineSourceMap(filename, code, clientCode)
				};
			},
			inspection: (result) =>
				result.inspectionCatalog && options.target === 'server'
					? {
							inspection: result.inspectionCatalog,
							redactions: result.inspectionRedactions,
							source: code
						}
					: undefined
		},
		...(input.compatibilityEngine
			? {
					compatibility: () =>
						input.compatibilityEngine!.transformModule({
							id: filename,
							source: code,
							format: /\.c[jt]s$/i.test(filename) ? 'commonjs' : 'module',
							target: options.target === 'server' ? 'server' : 'client',
							sourceMap: options.sourceMap ?? true
						})
				}
			: {}),
		warn: input.warn,
		profile: options.onProfile
			? { subsystem: 'vite-plugin' as const, sink: options.onProfile }
			: undefined
	});
	if (!output) return null;
	if (output.inspection) input.inspectionModules.set(path.resolve(filename), output.inspection);
	input.recordMicrofrontendModule(output.code, id);
	return { code: output.code, map: output.map, moduleType: 'js' };
}
