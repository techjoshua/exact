import {
	createCompilerSession,
	createLineSourceMap,
	exactExportConditions,
	resolveNativeCompilerExecutable,
	resolveExactArtifactImport,
	type ExactSourceInspection
} from '@exactjs/compiler';
import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';
import {
	containsExactBuildJsx,
	createExactDiagnosticReporter,
	isExactBuildSourceModule,
	shouldCompileExactBuildModule,
	shouldTransformExactBuildModulePath,
	transformExactAdapterModule
} from '@exactjs/compiler/adapter-support';
import {
	invalidateExactPluginRegistry,
	prepareExactPluginRegistry,
	type ExactPreparedPluginRegistry
} from '@exactjs/plugin-host/node';
import { createReactCompatibilityBuildEngine } from '@exactjs/react-compat/build';
import {
	jsxSourceOwnership,
	resolveReactCompatibility,
	validateInstalledReactReconciler
} from '@exactjs/react-compat/plugin';
import { transformReactJsx, usesReactRuntimeImports } from '@exactjs/react-compat/transform';
import path from 'node:path';
import { assertExactViteClientArtifactIsolation } from './artifact-isolation.js';
import { createExactViteMicrofrontendIntegration } from './microfrontends.js';
import { exactModuleFilename, exactTransformTarget } from './module-selection.js';
import { rewriteWithCompatibility, viteReactAliases } from './react-compatibility-emission.js';
import {
	createViteInspectionCatalog,
	exactDevtoolsRuntimeBootstrap,
	exactDevtoolsRuntimeModule,
	injectModuleBootstrap,
	inspectionCatalogEnabled,
	inspectionRuntimeEnabled,
	prependViteDevtoolsRuntimeImport,
	resolvedExactDevtoolsRuntimeModule,
	validateViteDebugIdentity
} from './debug-output.js';
import type { ExactPlugin, ExactPluginOptions } from './plugin-contracts.js';
import {
	createViteDomEnhancementFacade,
	createViteEnhancementCatalogRuntime,
	exactEnhancementCatalogModule,
	exactEnhancementDomModule,
	prependViteEnhancementRegistrations,
	resolvedExactEnhancementCatalogModule,
	resolvedExactEnhancementDomModule
} from './enhancement-catalog.js';

export type {
	ExactPlugin,
	ExactPluginOptions,
	ExactViteDebugOptions,
	ExactViteProfileEvent
} from './plugin-contracts.js';

/** Creates the Vite plugin that transforms eXact JSX and resolves .exact facade imports. */
export function exact(options: ExactPluginOptions = {}): ExactPlugin {
	let diagnosticsEnabled = options.diagnostics ?? false;
	let compilerSession = createCompilerSession({
		nativeCompiler: { executable: resolveNativeCompilerExecutable() },
		onProfile: options.onProfile
	});
	const diagnosticReporter = createExactDiagnosticReporter();
	const configureDiagnostics = (enabled: boolean): void => {
		if (enabled === diagnosticsEnabled) return;
		compilerSession.dispose();
		diagnosticsEnabled = enabled;
		compilerSession = createCompilerSession({
			nativeCompiler: { executable: resolveNativeCompilerExecutable() },
			onProfile: options.onProfile
		});
	};
	const compatibilityCwd =
		(typeof options.reactCompatibility === 'object' ? options.reactCompatibility.cwd : undefined) ??
		options.applicationRoot ??
		process.cwd();
	const reactCompatibility = resolveReactCompatibility(
		options.reactCompatibility,
		compatibilityCwd
	);
	const compatibilityEngine = reactCompatibility
		? createReactCompatibilityBuildEngine(
				typeof options.reactCompatibility === 'object'
					? options.reactCompatibility
					: { cwd: compatibilityCwd, target: reactCompatibility.target }
			)
		: undefined;
	let preparedRegistry: ExactPreparedPluginRegistry | undefined;
	let viteCommand: 'build' | 'serve' = 'build';
	let configuredDebug = options.debug;
	const inspectionModules = new Map<
		string,
		Readonly<{
			inspection: ExactSourceInspection;
			redactions?: ExactInspectionRedactionCatalog;
			source: string;
		}>
	>();
	const microfrontends = createExactViteMicrofrontendIntegration(options);
	const prepareRegistry = async (): Promise<ExactPreparedPluginRegistry> => {
		if (preparedRegistry) return preparedRegistry;
		preparedRegistry = await prepareExactPluginRegistry({
			applicationRoot: options.applicationRoot,
			configPath: options.configPath,
			hostMode: 'compiler'
		});
		configuredDebug ??= preparedRegistry.config?.debug;
		return preparedRegistry;
	};
	return {
		name: 'exact',
		enforce: 'pre',
		config() {
			return {
				resolve: {
					conditions: exactExportConditions(
						options.target === 'server' ? 'server' : 'client',
						options
					),
					...(reactCompatibility ? { alias: viteReactAliases(reactCompatibility) } : {})
				},
				...(options.configureJsxRuntime === false
					? {}
					: {
							oxc: {
								jsx: {
									runtime: 'automatic' as const,
									importSource: '@exactjs/jsx' as const
								}
							}
						})
			};
		},
		configResolved(config) {
			viteCommand = config.command;
			configureDiagnostics(options.diagnostics ?? config.command === 'serve');
		},
		async buildStart() {
			inspectionModules.clear();
			for (const file of compatibilityEngine?.watchFiles ?? []) this.addWatchFile(file);
			const registry = await prepareRegistry();
			validateViteDebugIdentity(configuredDebug, viteCommand);
			for (const file of registry.watchFiles) this.addWatchFile(file);
			for (const warning of registry.warnings) this.warn?.(warning);
			await microfrontends.buildStart(
				registry,
				viteCommand === 'build' && this.emitFile
					? (file) =>
							this.emitFile!({
								type: 'chunk',
								id: file.id,
								name: file.name,
								preserveSignature: file.preserveSignature
							})
					: undefined,
				viteCommand
			);
		},
		configureServer(server) {
			server.httpServer?.once('close', () => compilerSession.dispose());
			server.watcher?.once('close', () => compilerSession.dispose());
		},
		resolveId(source, importer) {
			if (source === exactEnhancementDomModule) return resolvedExactEnhancementDomModule;
			if (source === exactEnhancementCatalogModule) return resolvedExactEnhancementCatalogModule;
			if (
				source === exactDevtoolsRuntimeModule &&
				options.target !== 'server' &&
				inspectionRuntimeEnabled(configuredDebug, viteCommand)
			)
				return resolvedExactDevtoolsRuntimeModule;
			const resolveFrameworkImport = () => {
				if (source === '@exactjs/dom' && importer === resolvedExactEnhancementDomModule) {
					return resolveExactArtifactImport(source, importer, 'client')?.id ?? null;
				}
				if (source === 'react-reconciler' && reactCompatibility) {
					validateInstalledReactReconciler(
						reactCompatibility.target,
						importer ? path.dirname(importer) : process.cwd()
					);
				}
				return (
					resolveExactArtifactImport(
						source,
						importer,
						options.target === 'server' ? 'server' : 'client'
					)?.id ?? null
				);
			};
			if (source === '@exactjs/dom' && importer !== resolvedExactEnhancementDomModule)
				return resolvedExactEnhancementDomModule;
			return microfrontends.resolveId(
				source,
				importer,
				resolveFrameworkImport,
				this.resolve
					? (request, owner) => this.resolve!(request, owner, { skipSelf: true })
					: undefined
			);
		},
		load(id) {
			if (id === resolvedExactEnhancementDomModule) {
				return {
					code: createViteDomEnhancementFacade(),
					moduleType: 'js'
				};
			}
			if (id === resolvedExactEnhancementCatalogModule) {
				return { code: createViteEnhancementCatalogRuntime(), moduleType: 'js' };
			}
			if (id === resolvedExactDevtoolsRuntimeModule)
				return {
					code: exactDevtoolsRuntimeBootstrap(configuredDebug),
					moduleType: 'js'
				};
			return microfrontends.load(id);
		},
		transformIndexHtml: {
			order: 'pre',
			handler(html) {
				const remoteHtml = microfrontends.transformIndexHtml(html);
				if (options.target === 'server' || !inspectionRuntimeEnabled(configuredDebug, viteCommand))
					return remoteHtml;
				const moduleId =
					viteCommand === 'serve'
						? `/@id/${exactDevtoolsRuntimeModule}`
						: exactDevtoolsRuntimeModule;
				return injectModuleBootstrap(remoteHtml, moduleId);
			}
		},
		generateBundle(_output, bundle) {
			if (options.target !== 'server') assertExactViteClientArtifactIsolation(bundle);
			if (options.target === 'server' && inspectionCatalogEnabled(configuredDebug, viteCommand)) {
				const catalog = createViteInspectionCatalog(
					options.applicationRoot,
					configuredDebug,
					inspectionModules,
					viteCommand
				);
				if (catalog) {
					if (!this.emitFile)
						throw new Error('Vite/Rollup emitFile is unavailable for eXact inspection catalog');
					this.emitFile({
						type: 'asset',
						fileName: `.exact-inspection/${catalog.buildKey}.json`,
						source: `${JSON.stringify(catalog, null, 2)}\n`
					});
				}
			}
			microfrontends.generateBundle(bundle);
		},
		handleHotUpdate(context) {
			if (options.diagnostics === undefined) configureDiagnostics(true);
			compatibilityEngine?.invalidate(context.file);
			if (preparedRegistry?.watchFiles.includes(path.resolve(context.file))) {
				invalidateExactPluginRegistry(preparedRegistry.applicationRoot);
				preparedRegistry = undefined;
			}
			// The compiler session owns watch-file classification so every
			// integration applies the same source, project, and asset rules.
			diagnosticReporter(compilerSession.invalidate(context.file), (message) =>
				this.warn?.(message)
			);
		},
		watchChange(id, change) {
			if (options.diagnostics === undefined) configureDiagnostics(true);
			compatibilityEngine?.invalidate(id);
			if (preparedRegistry?.watchFiles.includes(path.resolve(id))) {
				invalidateExactPluginRegistry(preparedRegistry.applicationRoot);
				preparedRegistry = undefined;
			}
			diagnosticReporter(compilerSession.invalidate(id, change.event === 'delete'), (message) =>
				this.warn?.(message)
			);
		},
		closeBundle() {
			compilerSession.dispose();
		},
		transform(code, id) {
			if (!isExactBuildSourceModule(id)) return null;
			const filename = exactModuleFilename(id);
			if (!shouldTransformExactBuildModulePath(filename, options)) return null;
			microfrontends.recordModule(code, id);
			const ownership = jsxSourceOwnership(filename, code, reactCompatibility);
			const output = transformExactAdapterModule({
				source: code,
				filename,
				errorId: id,
				jsxOwnership: ownership,
				usesReactRuntimeImports: usesReactRuntimeImports(code, filename),
				transformReact: containsExactBuildJsx(filename, code),
				shouldCompile: shouldCompileExactBuildModule(filename, code, {
					...options,
					pluginRegistry: options.pluginRegistry ?? preparedRegistry?.compiler
				}),
				...(reactCompatibility
					? {
							react: () => {
								const lowered = transformReactJsx(code, {
									filename,
									target: reactCompatibility.target,
									sourceMap: false
								});
								return rewriteWithCompatibility(
									compatibilityEngine!,
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
						session: compilerSession,
						target: exactTransformTarget(options),
						serverComponents: options.serverComponents,
						sourceMap: false,
						assetRules: options.assetRules,
						preserveClientAssetImports: true,
						pluginRegistry: options.pluginRegistry ?? preparedRegistry?.compiler,
						jsxInterop: compatibilityEngine?.jsxInterop,
						emitInspection:
							options.target === 'server' && inspectionCatalogEnabled(configuredDebug, viteCommand),
						instrumentInspection: inspectionRuntimeEnabled(configuredDebug, viteCommand)
					},
					finish: (result) => {
						const rewritten = compatibilityEngine
							? compatibilityEngine.transformModule({
									id: filename,
									source: result.code,
									format: 'module',
									target: options.target === 'server' ? 'server' : 'client',
									sourceMap: false
								})
							: { code: result.code };
						const enhancementCode = prependViteEnhancementRegistrations(
							rewritten.code,
							result.rendererEnhancements
						);
						const clientCode = prependViteDevtoolsRuntimeImport(
							enhancementCode,
							options.target !== 'server' && inspectionRuntimeEnabled(configuredDebug, viteCommand)
						);
						return {
							code: clientCode,
							map:
								options.sourceMap === false ? null : createLineSourceMap(filename, code, clientCode)
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
				...(compatibilityEngine
					? {
							compatibility: () =>
								compatibilityEngine.transformModule({
									id: filename,
									source: code,
									format: /\.c[jt]s$/i.test(filename) ? 'commonjs' : 'module',
									target: options.target === 'server' ? 'server' : 'client',
									sourceMap: options.sourceMap ?? true
								})
						}
					: {}),
				warn: (message) => this.warn?.(message),
				profile: options.onProfile
					? { subsystem: 'vite-plugin' as const, sink: options.onProfile }
					: undefined
			});
			if (!output) return null;
			if (output.inspection) inspectionModules.set(path.resolve(filename), output.inspection);
			microfrontends.recordModule(output.code, id);
			return { code: output.code, map: output.map, moduleType: 'js' };
		}
	};
}
