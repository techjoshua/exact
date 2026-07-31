import {
	createCompilerSession,
	createLineSourceMap,
	exactExportConditions,
	resolveNativeCompilerExecutable,
	resolveExactArtifactImport,
	transformSource,
	type ExactCompilerManifest,
	type ExactSourceInspection
} from '@exactjs/compiler';
import { createExactDiagnosticReporter } from '@exactjs/compiler/adapter-support';
import { profileTimestamp } from '@exactjs/instrumentation';
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
import {
	containsExactJsx,
	exactImportedManifests,
	exactModuleFilename,
	exactTransformTarget,
	isExactTransformableModule,
	shouldCompileExactModule,
	shouldTransformExactModule
} from './module-selection.js';
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
			manifest: ExactCompilerManifest;
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
			if (
				source === exactDevtoolsRuntimeModule &&
				options.target !== 'server' &&
				inspectionRuntimeEnabled(configuredDebug, viteCommand)
			)
				return resolvedExactDevtoolsRuntimeModule;
			const resolveFrameworkImport = () => {
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
			if (!isExactTransformableModule(id)) return null;
			const filename = exactModuleFilename(id);
			if (!shouldTransformExactModule(filename, options)) return null;
			microfrontends.recordModule(code, id);
			const profileStarted = options.onProfile ? profileTimestamp() : undefined;
			try {
				const ownership = jsxSourceOwnership(filename, code, reactCompatibility);
				const reactOwned =
					ownership === 'react' ||
					(ownership === 'unknown' && usesReactRuntimeImports(code, filename));
				if (reactOwned && containsExactJsx(filename, code)) {
					if (!reactCompatibility) return null;
					const lowered = transformReactJsx(code, {
						filename,
						target: reactCompatibility.target,
						sourceMap: false
					});
					const rewritten = rewriteWithCompatibility(
						compatibilityEngine!,
						lowered.code,
						filename,
						options.target,
						options.sourceMap,
						code
					);
					microfrontends.recordModule(rewritten.code, id);
					return { ...rewritten, moduleType: 'js' };
				}
				if (
					shouldCompileExactModule(
						filename,
						code,
						options,
						options.pluginRegistry ?? preparedRegistry?.compiler
					)
				) {
					const result = transformSource(code, {
						filename,
						session: compilerSession,
						target: exactTransformTarget(options),
						importedManifests: exactImportedManifests(options),
						serverComponents: options.serverComponents,
						sourceMap: false,
						assetRules: options.assetRules,
						preserveClientAssetImports: true,
						pluginRegistry: options.pluginRegistry ?? preparedRegistry?.compiler,
						jsxInterop: compatibilityEngine?.jsxInterop,
						emitInspection:
							options.target === 'server' && inspectionCatalogEnabled(configuredDebug, viteCommand),
						instrumentInspection: inspectionRuntimeEnabled(configuredDebug, viteCommand)
					});
					if (result.inspectionCatalog && options.target === 'server') {
						inspectionModules.set(path.resolve(filename), {
							inspection: result.inspectionCatalog,
							manifest: result.manifest,
							source: code
						});
					}
					const rewritten = compatibilityEngine
						? compatibilityEngine.transformModule({
								id: filename,
								source: result.code,
								format: 'module',
								target: options.target === 'server' ? 'server' : 'client',
								sourceMap: false
							})
						: { code: result.code };
					const clientCode = prependViteDevtoolsRuntimeImport(
						rewritten.code,
						options.target !== 'server' && inspectionRuntimeEnabled(configuredDebug, viteCommand)
					);
					microfrontends.recordModule(clientCode, id);
					return {
						code: clientCode,
						map:
							options.sourceMap === false ? null : createLineSourceMap(filename, code, clientCode),
						moduleType: 'js'
					};
				}
				if (!compatibilityEngine) return null;
				const rewritten = compatibilityEngine.transformModule({
					id: filename,
					source: code,
					format: /\.c[jt]s$/i.test(filename) ? 'commonjs' : 'module',
					target: options.target === 'server' ? 'server' : 'client',
					sourceMap: options.sourceMap ?? true
				});
				for (const diagnostic of rewritten.diagnostics)
					if (diagnostic.severity === 'warning') this.warn?.(diagnostic.message);
				if (rewritten.changed) microfrontends.recordModule(rewritten.code, id);
				return rewritten.changed
					? { code: rewritten.code, map: rewritten.map, moduleType: 'js' }
					: null;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`eXact JSX transform failed for ${id}\n${message}`);
			} finally {
				if (profileStarted !== undefined) {
					options.onProfile?.(
						Object.freeze({
							subsystem: 'vite-plugin',
							phase: 'transform',
							elapsedMs: profileTimestamp() - profileStarted,
							attributes: Object.freeze({ filename })
						})
					);
				}
			}
		}
	};
}
