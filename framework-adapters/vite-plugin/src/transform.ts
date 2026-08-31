import {
	createTokenSourceMap,
	type ExactSourceInspection,
	type ExactCompilerSession
} from '@exactjs/compiler';
import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';
import type { IntlBuildCoordinator } from '@exactjs/intl-build';
import type { ReactCompatibilityBuildEngine } from '@exactjs/react-compat/build';
import { jsxSourceOwnership, type ResolvedReactCompatibility } from '@exactjs/react-compat/plugin';
import { transformReactJsx, usesReactRuntimeImports } from '@exactjs/react-compat/transform';
import {
	containsExactBuildJsx,
	exactComponentContractProjection,
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
import {
	exactModuleFilename,
	exactTestModuleTarget,
	exactTransformTargetForModule
} from './module-selection.js';
import type { ExactPluginOptions, ExactViteDebugOptions } from './plugin-contracts.js';
import type { ExactLanguageProjectionV1 } from '@exactjs/language-extension-api';
import { rewriteWithCompatibility } from './react-compatibility-emission.js';
import type { ExactPackageEnhancementImport } from '@exactjs/config';

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
	requestTarget?: 'client' | 'server';
	applicationRoot: string;
	compilerSession: ExactCompilerSession;
	packageEnhancements?: readonly ExactPackageEnhancementImport[];
	reactCompatibility?: ResolvedReactCompatibility;
	compatibilityEngine?: ReactCompatibilityBuildEngine;
	configuredDebug?: ExactViteDebugOptions;
	languageValidation: boolean;
	viteCommand: 'build' | 'serve';
	componentAuthorization: ExactViteComponentAuthorization;
	inspectionModules: Map<string, ExactViteInspectionRecord>;
	intl: IntlBuildCoordinator;
	recordMicrofrontendModule(code: string, id: string): void;
	warn(message: string): void;
}>;

/** Runs the compiler/compatibility transform while projecting adapter-owned build metadata. */
export function transformExactViteModule(input: TransformExactViteModuleOptions): {
	code: string;
	map: unknown;
	moduleType: 'js';
	languageProjection?: ExactLanguageProjectionV1;
} | null {
	const { code, id, options } = input;
	const target = exactTransformTargetForModule(id, options, input.requestTarget);
	const renderMode =
		target === 'server' && options.renderMode === 'hydrate' ? 'server-render' : options.renderMode;
	const internationalization = options.internationalization || undefined;
	if (!isExactBuildSourceModule(id)) return null;
	const filename = exactModuleFilename(id);
	const reachedPublication = internationalization
		? input.intl.activateReachedSource(code, filename)
		: undefined;
	if (!shouldTransformExactBuildModulePath(filename, options))
		return reachedPublication
			? {
					code: reachedPublication.code,
					map:
						options.sourceMap === false
							? null
							: createTokenSourceMap(filename, code, reachedPublication.code),
					moduleType: 'js'
				}
			: null;
	const authoredOwnership = jsxSourceOwnership(filename, code, input.reactCompatibility);
	const intlAnalysis =
		internationalization && authoredOwnership !== 'react'
			? input.intl.analyzeConfiguredSource(code, filename)
			: undefined;
	for (const diagnostic of intlAnalysis?.diagnostics ?? [])
		input.warn(`${diagnostic.file}:${diagnostic.start}: ${diagnostic.message}`);
	const analyzedCode = intlAnalysis?.code ?? code;
	const ownership = intlAnalysis
		? jsxSourceOwnership(filename, analyzedCode, input.reactCompatibility)
		: authoredOwnership;
	const shouldCompile = shouldCompileExactBuildModule(filename, analyzedCode, options);
	const output = transformExactAdapterModule({
		source: analyzedCode,
		filename,
		errorId: id,
		jsxOwnership: ownership,
		usesReactRuntimeImports: usesReactRuntimeImports(analyzedCode, filename),
		transformReact: containsExactBuildJsx(filename, analyzedCode),
		shouldCompile,
		...(input.reactCompatibility
			? {
					react: () => {
						const lowered = transformReactJsx(analyzedCode, {
							filename,
							target: input.reactCompatibility!.target,
							sourceMap: false
						});
						return rewriteWithCompatibility(
							input.compatibilityEngine!,
							lowered.code,
							filename,
							target,
							options.sourceMap,
							analyzedCode
						);
					}
				}
			: {}),
		compiler: {
			options: {
				session: input.compilerSession,
				root: input.applicationRoot,
				configFile: options.typescriptConfig
					? path.resolve(input.applicationRoot, options.typescriptConfig)
					: undefined,
				packageEnhancements: input.packageEnhancements,
				target,
				componentContractProjection: shouldCompile
					? exactComponentContractProjection(target, renderMode)
					: 'complete',
				serverComponents: options.serverComponents,
				sourceMap: false,
				assetRules: options.assetRules,
				preserveClientAssetImports: true,
				jsxInterop: input.compatibilityEngine?.jsxInterop,
				emitInspection:
					input.languageValidation ||
					(target === 'server' &&
						inspectionCatalogEnabled(input.configuredDebug, input.viteCommand)),
				instrumentInspection: inspectionRuntimeEnabled(input.configuredDebug, input.viteCommand)
			},
			finish: (result) => {
				if (intlAnalysis?.descriptors.length && options.internationalization) {
					input.intl.linkDescriptorOwners(intlAnalysis, result.componentBuild.components, filename);
				}
				input.componentAuthorization.record(filename, result.componentBuild, code);
				const rewritten = input.compatibilityEngine
					? input.compatibilityEngine.transformModule({
							id: filename,
							source: result.code,
							format: 'module',
							target,
							sourceMap: false
						})
					: { code: result.code };
				const enhanced = prependViteEnhancementRegistrations(
					rewritten.code,
					result.rendererEnhancements
				);
				const clientCode = prependViteDevtoolsRuntimeImport(
					enhanced,
					target !== 'server' && inspectionRuntimeEnabled(input.configuredDebug, input.viteCommand)
				);
				const projectedCode = projectTestTargetComponentImports(
					clientCode,
					result.componentBuild.componentImports,
					exactTestModuleTarget(id, options)
				);
				return {
					code: projectedCode,
					map:
						options.sourceMap === false ? null : createTokenSourceMap(filename, code, projectedCode)
				};
			},
			inspection: (result) =>
				result.inspectionCatalog
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
							source: analyzedCode,
							format: /\.c[jt]s$/i.test(filename) ? 'commonjs' : 'module',
							target,
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
	if (
		output.inspection &&
		target === 'server' &&
		inspectionCatalogEnabled(input.configuredDebug, input.viteCommand)
	)
		input.inspectionModules.set(path.resolve(filename), output.inspection);
	input.recordMicrofrontendModule(output.code, id);
	return {
		code: output.code,
		map: output.map,
		moduleType: 'js',
		...(output.inspection
			? { languageProjection: output.inspection.inspection.languageProjection }
			: {})
	};
}

/** Uses compiler-emitted component edges to keep one queried test graph target-local. */
export function projectTestTargetComponentImports(
	code: string,
	imports: readonly Readonly<{ moduleSpecifier: string }>[],
	target: 'client' | 'server' | undefined
): string {
	if (!target) return code;
	let projected = code;
	for (const { moduleSpecifier } of imports) {
		if (
			!moduleSpecifier.startsWith('.') ||
			moduleSpecifier.includes('?') ||
			!/(?:^|\/)[^/]+\.[cm]?[jt]sx?$/iu.test(moduleSpecifier.replaceAll('\\', '/'))
		)
			continue;
		const escaped = moduleSpecifier.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
		const query = `${moduleSpecifier}?exact-target=${target}`;
		projected = projected
			.replace(new RegExp(`(from\\s+)(['"])${escaped}\\2`, 'gu'), `$1'${query}'`)
			.replace(new RegExp(`(import\\s*\\(\\s*)(['"])${escaped}\\2`, 'gu'), `$1'${query}'`)
			.replace(new RegExp(`(import\\s*)(['"])${escaped}\\2`, 'gu'), `$1'${query}'`);
	}
	return projected;
}
