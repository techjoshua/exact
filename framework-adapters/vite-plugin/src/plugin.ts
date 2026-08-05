import {
	createCompilerSession,
	exactExportConditions,
	inspectExactComponentBuildFacts,
	resolveNativeCompilerExecutable,
	resolveExactArtifactImport
} from '@exactjs/compiler';
import { loadExactConfig, type ExactLoadedConfig } from '@exactjs/config/node';
import {
	createExactDiagnosticReporter,
	shouldCompileExactBuildModule,
	shouldTransformExactBuildModulePath
} from '@exactjs/compiler/adapter-support';
import {
	invalidateExactPluginRegistry,
	prepareExactPluginRegistry,
	type ExactPreparedPluginRegistry
} from '@exactjs/plugin-host/node';
import { createReactCompatibilityBuildEngine } from '@exactjs/react-compat/build';
import {
	resolveReactCompatibility,
	validateInstalledReactReconciler
} from '@exactjs/react-compat/plugin';
import path from 'node:path';
import { assertExactViteClientArtifactIsolation } from './artifact-isolation.js';
import { createExactViteMicrofrontendIntegration } from './microfrontends.js';
import { exactModuleFilename, exactTransformTarget } from './module-selection.js';
import { viteReactAliases } from './react-compatibility-emission.js';
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
import { exactEnhancementFacades } from './enhancement-catalog.js';
import {
	ExactViteComponentAuthorization,
	isExactViteOmittedEnhancement
} from './component-authorization.js';
import { transformExactViteModule, type ExactViteInspectionRecord } from './transform.js';

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
	let loadedConfig: ExactLoadedConfig | undefined;
	const componentAuthorization = new ExactViteComponentAuthorization();
	let viteCommand: 'build' | 'serve' = 'build';
	let configuredDebug = options.debug;
	const inspectionModules = new Map<string, ExactViteInspectionRecord>();
	const microfrontends = createExactViteMicrofrontendIntegration(options);
	const prepareRegistry = async (): Promise<ExactPreparedPluginRegistry> => {
		if (preparedRegistry) return preparedRegistry;
		loadedConfig ??= await loadExactConfig({
			applicationRoot: path.resolve(options.applicationRoot ?? process.cwd()),
			configPath: options.configPath
		});
		preparedRegistry = await prepareExactPluginRegistry({
			applicationRoot: options.applicationRoot,
			loadedConfig,
			hostMode: 'build'
		});
		configuredDebug ??= preparedRegistry.config?.debug;
		return preparedRegistry;
	};
	const openAuthorizationGeneration = (registry: ExactPreparedPluginRegistry): void => {
		componentAuthorization.open({
			applicationRoot: registry.applicationRoot,
			buildKey: configuredDebug?.buildKey,
			config: loadedConfig?.config?.componentLibraries
		});
	};
	return {
		name: 'exact',
		enforce: 'pre',
		config() {
			return {
				...(options.target === 'server'
					? { optimizeDeps: { noDiscovery: true as const, include: [] } }
					: {}),
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
			if (options.target === 'server') openAuthorizationGeneration(registry);
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
			if (source in exactEnhancementFacades) {
				const facade = exactEnhancementFacades[source as keyof typeof exactEnhancementFacades];
				const resolved = this.resolve ? this.resolve(facade, importer, { skipSelf: true }) : facade;
				if (!componentAuthorization.requires(source, importer)) return resolved;
				return Promise.resolve(resolved).then((value) =>
					componentAuthorization.authorize(value, source, importer, {
						applicationRoot:
							preparedRegistry?.applicationRoot ?? options.applicationRoot ?? process.cwd(),
						executionReason: options.serverExecutionReason,
						watch: (file) => this.addWatchFile?.(file)
					})
				);
			}
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
			const resolved = microfrontends.resolveId(
				source,
				importer,
				resolveFrameworkImport,
				this.resolve
					? (request, owner) => this.resolve!(request, owner, { skipSelf: true })
					: undefined
			);
			if (!componentAuthorization.requires(source, importer)) return resolved;
			return Promise.resolve(resolved)
				.then(
					(value) =>
						value ?? (this.resolve ? this.resolve(source, importer, { skipSelf: true }) : null)
				)
				.then((value) =>
					componentAuthorization.authorize(value, source, importer, {
						applicationRoot:
							preparedRegistry?.applicationRoot ?? options.applicationRoot ?? process.cwd(),
						executionReason: options.serverExecutionReason,
						watch: (file) => this.addWatchFile?.(file)
					})
				);
		},
		load(id) {
			if (isExactViteOmittedEnhancement(id)) return { code: 'export {};\n', moduleType: 'js' };
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
			if (options.target === 'server' && componentAuthorization.active) {
				if (!this.emitFile)
					throw new Error('Vite/Rollup emitFile is unavailable for component authorization');
				const emitFile = this.emitFile.bind(this);
				return componentAuthorization.commit()!.then((committed) => {
					emitFile({
						type: 'asset',
						fileName: '.exact/component-library-authorization.json',
						source: `${JSON.stringify(committed.manifest, null, 2)}\n`
					});
					emitFile({
						type: 'asset',
						fileName: '.exact/component-library-audit.json',
						source: `${JSON.stringify(committed.audit, null, 2)}\n`
					});
					microfrontends.generateBundle(bundle);
				});
			}
			microfrontends.generateBundle(bundle);
		},
		async handleHotUpdate(context) {
			if (options.diagnostics === undefined) configureDiagnostics(true);
			compatibilityEngine?.invalidate(context.file);
			if (preparedRegistry?.watchFiles.includes(path.resolve(context.file))) {
				invalidateExactPluginRegistry(preparedRegistry.applicationRoot);
				preparedRegistry = undefined;
				loadedConfig = undefined;
			}
			// The compiler session owns watch-file classification so every
			// integration applies the same source, project, and asset rules.
			diagnosticReporter(compilerSession.invalidate(context.file), (message) =>
				this.warn?.(message)
			);
			if (options.target === 'server') {
				const filename = exactModuleFilename(context.file);
				const previous = componentAuthorization.invalidate(filename);
				const registry = await prepareRegistry();
				openAuthorizationGeneration(registry);
				if (
					context.read &&
					context.server?.pluginContainer?.resolveId &&
					shouldTransformExactBuildModulePath(filename, options)
				) {
					try {
						const source = await context.read();
						if (shouldCompileExactBuildModule(filename, source, options)) {
							const facts = inspectExactComponentBuildFacts(source, {
								session: compilerSession,
								filename,
								target: exactTransformTarget(options),
								serverComponents: options.serverComponents
							});
							componentAuthorization.record(filename, facts, source);
							const requests = new Set([
								...facts.componentImports
									.filter((edge) => edge.artifactTargets.includes('server'))
									.map((edge) => edge.moduleSpecifier),
								...facts.rendererEnhancements.map((edge) => edge.moduleSpecifier)
							]);
							for (const request of requests) {
								const resolved = await context.server.pluginContainer.resolveId(request, filename);
								await componentAuthorization.authorize(resolved, request, filename, {
									applicationRoot: registry.applicationRoot,
									executionReason: options.serverExecutionReason,
									watch: (file) => this.addWatchFile?.(file)
								});
							}
							await componentAuthorization.commit();
							openAuthorizationGeneration(registry);
						}
					} catch (error) {
						componentAuthorization.reject();
						componentAuthorization.restore(filename, previous);
						openAuthorizationGeneration(registry);
						throw error;
					}
				}
			}
		},
		watchChange(id, change) {
			if (options.diagnostics === undefined) configureDiagnostics(true);
			compatibilityEngine?.invalidate(id);
			if (preparedRegistry?.watchFiles.includes(path.resolve(id))) {
				invalidateExactPluginRegistry(preparedRegistry.applicationRoot);
				preparedRegistry = undefined;
				loadedConfig = undefined;
			}
			diagnosticReporter(compilerSession.invalidate(id, change.event === 'delete'), (message) =>
				this.warn?.(message)
			);
		},
		closeBundle() {
			componentAuthorization.dispose();
			compilerSession.dispose();
		},
		transform(code, id) {
			return transformExactViteModule({
				code,
				id,
				options,
				compilerSession,
				reactCompatibility,
				compatibilityEngine,
				configuredDebug,
				viteCommand,
				componentAuthorization,
				inspectionModules,
				recordMicrofrontendModule: (source, moduleId) =>
					microfrontends.recordModule(source, moduleId),
				warn: (message) => this.warn?.(message)
			});
		}
	};
}
