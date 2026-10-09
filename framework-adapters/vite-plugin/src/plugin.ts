import { loadExactViteVirtualModule } from './virtual-modules.js';
import { ExactViteDevelopmentEnhancementCatalog } from './development-enhancement-catalog.js';
import { refreshExactViteCatalogModules } from './intl-hot-update.js';
import { ExactViteDevelopmentUpdates } from './development-updates.js';
import { createExactViteRootOwners } from './root-owners.js';
import { existsSync } from 'node:fs';
import { preflightExactViteChangedSource } from './changed-source-preflight.js';
import {
	shouldCompileExactBuildModule,
	shouldTransformExactBuildModulePath
} from '@exactjs/compiler/adapter-support';
import type { ExactPreparedPluginRegistry } from '@exactjs/plugin-host/node';
import { assertExactViteClientArtifactIsolation } from './artifact-isolation.js';
import {
	createExactViteAuthorizationOptions,
	ensureExactViteServerAuthorization
} from './authorization-options.js';
import {
	assertExactViteBuildTarget,
	exactModuleFilename,
	isExactViteCacheModule,
	exactTransformTarget
} from './module-selection.js';
import { exactViteConfig } from './vite-config.js';
import {
	exactDevtoolsRuntimeModule,
	injectModuleBootstrap,
	inspectionRuntimeEnabled,
	resolvedExactDevtoolsRuntimeModule,
	validateViteDebugIdentity
} from './debug-output.js';
import type { ExactPlugin, ExactPluginOptions } from './plugin-contracts.js';
import {
	ExactViteEnhancementFacadeCatalog,
	resolveExactViteTargetEnhancement
} from './enhancement-catalog.js';
import { ExactViteComponentAuthorization } from './component-authorization.js';
import { transformExactViteModule, type ExactViteInspectionRecord } from './transform.js';
import {
	createExactLanguageValidationSession,
	type ExactLanguageValidationSession
} from '@exactjs/language-extension-host';
import { ExactViteCompilerSession } from './compiler-session.js';
import { emitExactViteServerArtifacts } from './server-artifacts.js';
import { resolveExactTestTargetRequest } from './test-host/module-selection.js';
import { resolveExactFrameworkImport } from './framework-import.js';
import { attachExactViteServerDisposal } from './server-lifecycle.js';
import { finalizeExactViteTransform } from './transform-result.js';
import { ExactViteTestHelperTargets } from './test-host/helper-targets.js';

/** Creates the Vite plugin that transforms eXact JSX and resolves .exact facade imports. */
export function exact(options: ExactPluginOptions = {}): ExactPlugin {
	const compiler = new ExactViteCompilerSession(options.diagnostics ?? false, options.onProfile);
	let { reactCompatibility, compatibilityEngine, configuration, intl, microfrontends } =
		createExactViteRootOwners(options);
	let languageValidation: ExactLanguageValidationSession | undefined;
	let disposed = false;
	const componentAuthorization = new ExactViteComponentAuthorization();
	const developmentUpdates = new ExactViteDevelopmentUpdates();
	const enhancementFacadeCatalog = new ExactViteEnhancementFacadeCatalog();
	const developmentCatalog = new ExactViteDevelopmentEnhancementCatalog();
	let viteCommand: 'build' | 'serve' = 'build';
	let viteCacheDir: string | undefined;
	let configuredDebug = options.debug;
	let invalidateDevelopmentModules: (() => void) | undefined;
	let watchSourceConfiguration: ((files: readonly string[]) => void) | undefined;
	const testModuleTargets = new ExactViteTestHelperTargets(options);
	const authorizeOptions = (
		host: Parameters<typeof createExactViteAuthorizationOptions>[2],
		command = viteCommand
	) =>
		createExactViteAuthorizationOptions(
			options,
			configuration.registry?.applicationRoot ?? options.applicationRoot ?? process.cwd(),
			host,
			command
		);

	const inspectionModules = new Map<string, ExactViteInspectionRecord>();
	const disposeBuildProcesses = async (): Promise<void> => {
		disposed = true;
		testModuleTargets.clear();
		componentAuthorization.dispose();
		developmentCatalog.dispose();
		compiler.dispose();
		intl.dispose();
		await languageValidation?.dispose();
		languageValidation = undefined;
	};
	const explicitApplicationRoot = options.applicationRoot !== undefined;
	// Vite resolves a nested project's root independently of the launching cwd.
	// All root-sensitive owners must agree before configuration or builds begin.
	const configureRoot = (root: string | undefined) => {
		if (explicitApplicationRoot || !root || options.applicationRoot === root) return;
		options = { ...options, applicationRoot: root };
		intl.dispose();
		({ reactCompatibility, compatibilityEngine, configuration, intl, microfrontends } =
			createExactViteRootOwners(options));
	};
	const prepareRegistry = async (): Promise<ExactPreparedPluginRegistry> => {
		const registry = await configuration.read();
		configuredDebug = options.debug ?? registry.config?.debug;
		return registry;
	};
	const ensureServerAuthorization = (target: 'client' | 'server') =>
		ensureExactViteServerAuthorization(
			componentAuthorization,
			target,
			viteCommand,
			configuration.registry && authorizationGenerationOptions(configuration.registry)
		);
	const refreshLanguageValidation = async (registry: ExactPreparedPluginRegistry) => {
		await languageValidation?.dispose();
		languageValidation = createExactLanguageValidationSession({
			workspaceRoot: registry.applicationRoot,
			config: configuration.loaded?.config?.languageExtensions
		});
	};
	const refreshConfiguration = async () => refreshLanguageValidation(await prepareRegistry());
	const authorizationGenerationOptions = (registry: ExactPreparedPluginRegistry) => ({
		applicationRoot: registry.applicationRoot,
		buildKey: configuredDebug?.buildKey ?? (viteCommand === 'serve' ? 'development' : undefined),
		config: configuration.loaded?.config?.componentLibraries
	});
	return {
		name: 'exact',
		enforce: 'pre',
		config: (config) => {
			configureRoot(config?.root);
			return exactViteConfig(options, reactCompatibility);
		},
		configResolved(config) {
			testModuleTargets.configure(config);
			configureRoot(config.root);
			viteCommand = config.command;
			viteCacheDir = config.cacheDir;
			assertExactViteBuildTarget(options, config);
			compiler.configure(options.diagnostics ?? config.command === 'serve');
		},
		async buildStart() {
			if (disposed) throw new Error('eXact Vite plugin has been disposed');
			inspectionModules.clear();
			for (const file of compatibilityEngine?.watchFiles ?? []) this.addWatchFile(file);
			await intl.beginBuild();
			for (const file of intl.catalogFiles) this.addWatchFile(file);
			const registry = await prepareRegistry();
			if (disposed) throw new Error('eXact Vite plugin was disposed during startup');
			await refreshLanguageValidation(registry);
			if (options.target === 'server')
				componentAuthorization.open(authorizationGenerationOptions(registry));
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
			compiler.developmentWatchOwnsDiagnostics = true;
			watchSourceConfiguration = (files) => server.watcher?.add?.([...files]);
			invalidateDevelopmentModules = () => {
				server.moduleGraph?.invalidateAll();
				server.ws?.send({ type: 'full-reload' });
			};
			attachExactViteServerDisposal(server, disposeBuildProcesses);
		},
		async buildEnd(error) {
			if (!error) intl.validateCatalogs();
			if (options.target !== 'server' || viteCommand !== 'build' || !componentAuthorization.active)
				return;
			if (error) {
				componentAuthorization.reject();
				return;
			}
			if (!this.emitFile)
				throw new Error('Vite/Rollup emitFile is unavailable for component authorization');
			const committed = await componentAuthorization.commit();
			if (!committed) throw new Error('Vite component authorization generation is unavailable');
			emitExactViteServerArtifacts({
				applicationRoot: options.applicationRoot,
				debug: configuredDebug,
				command: viteCommand,
				inspections: inspectionModules,
				authorization: committed,
				emit: (file) => this.emitFile!(file)
			});
		},
		async resolveId(source, importer, hookOptions) {
			const requestTarget = testModuleTargets.request(importer, hookOptions?.ssr, source);
			const catalogId = developmentCatalog.resolve(source, requestTarget, viteCommand);
			if (catalogId) return catalogId;
			const resolveRequest = (request: string, owner?: string) =>
				testModuleTargets.resolve(request, owner, requestTarget, (request, owner) =>
					this.resolve ? this.resolve(request, owner, { skipSelf: true }) : Promise.resolve(null)
				);
			ensureServerAuthorization(requestTarget);
			const testResolution = await resolveExactTestTargetRequest(
				source,
				importer,
				options,
				this.resolve
					? (request, owner) => this.resolve!(request, owner, { skipSelf: true })
					: undefined
			);
			if (testResolution) return testResolution;
			const intlModule = intl.resolve(source);
			if (intlModule) return { id: intlModule, moduleSideEffects: false };
			const enhancement = await resolveExactViteTargetEnhancement({
				catalog: enhancementFacadeCatalog,
				source,
				importer,
				target: requestTarget,
				compiler: options,
				authorization: componentAuthorization,
				authorizeOptions: authorizeOptions(this),
				resolve: resolveRequest,
				retain: (id, target) => testModuleTargets.retain(id, target)
			});
			if (enhancement.matched) return enhancement.resolution ?? null;
			if (
				source === exactDevtoolsRuntimeModule &&
				requestTarget !== 'server' &&
				inspectionRuntimeEnabled(configuredDebug, viteCommand)
			)
				return resolvedExactDevtoolsRuntimeModule;
			const resolveFrameworkImport = () =>
				resolveExactFrameworkImport(
					source,
					importer,
					options,
					reactCompatibility?.target,
					requestTarget === 'server'
				);
			const resolved = await microfrontends.resolveId(
				source,
				importer,
				resolveFrameworkImport,
				this.resolve
					? (request, owner) => this.resolve!(request, owner, { skipSelf: true })
					: undefined
			);
			if (requestTarget !== 'server' || !componentAuthorization.requires(source, importer))
				return (
					resolved ??
					(options.serverExecutionReason === 'server-test' && requestTarget === 'server'
						? resolveRequest(source, importer)
						: null)
				);
			return Promise.resolve(resolved)
				.then((value) => value ?? resolveRequest(source, importer))
				.then((value) =>
					componentAuthorization.authorize(value, source, importer, authorizeOptions(this))
				);
		},
		load(id) {
			return (
				loadExactViteVirtualModule(id, {
					developmentCatalog,
					intl,
					enhancementFacadeCatalog,
					configuredDebug
				}) ?? microfrontends.load(id)
			);
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
			microfrontends.generateBundle(bundle);
		},
		async handleHotUpdate(context) {
			return developmentUpdates.run(async () => {
				if (disposed) return;
				intl.advanceGeneration();
				const localizedModules = await refreshExactViteCatalogModules(intl, context);
				if (localizedModules) return localizedModules;
				intl.invalidateSource(exactModuleFilename(context.file));
				if (options.diagnostics === undefined) compiler.configure(true);
				compatibilityEngine?.invalidate(context.file);
				if (configuration.invalidate(context.file)) {
					await refreshConfiguration();
					context.server?.moduleGraph?.invalidateAll?.();
					context.server?.ws?.send({ type: 'full-reload' });
				}

				// The compiler session owns watch-file classification so every
				// integration applies the same source, project, and asset rules.
				// Vite delivers watchChange before HMR, including when HMR is disabled.
				// An attached development server checks files there. Standalone hook
				// callers retain the existing diagnostic behavior.
				compiler.diagnoseHotUpdate(context.file, (message) => this.warn?.(message));
				if (componentAuthorization.active) {
					const filename = exactModuleFilename(context.file);
					const previous = componentAuthorization.invalidate(filename);
					const registry = await prepareRegistry();
					componentAuthorization.open(authorizationGenerationOptions(registry));
					try {
						const authorizationOptions = authorizeOptions(this, 'serve');
						await componentAuthorization.revalidate(
							authorizationOptions,
							componentAuthorization.watches(context.file) ? undefined : filename
						);
						if (context.read && shouldTransformExactBuildModulePath(filename, options)) {
							const source = await context.read();
							if (shouldCompileExactBuildModule(filename, source, options)) {
								await preflightExactViteChangedSource(
									source,
									{
										filename,
										session: compiler.current,
										target: exactTransformTarget(options),
										serverComponents: options.serverComponents
									},
									componentAuthorization,
									authorizationOptions,
									context.server?.pluginContainer?.resolveId
										? (request, importer) =>
												context.server!.pluginContainer!.resolveId!(request, importer)
										: undefined
								);
							}
						}
						await componentAuthorization.commit(authorizationGenerationOptions(registry));
					} catch (error) {
						componentAuthorization.reject();
						componentAuthorization.restore(filename, previous);
						componentAuthorization.open(authorizationGenerationOptions(registry));
						throw error;
					}
				}
			});
		},
		async watchChange(id, change) {
			intl.advanceGeneration();
			if (intl.isCatalogFile(id)) {
				await intl.refreshCatalogGeneration();
				return;
			}
			intl.invalidateSource(exactModuleFilename(id));
			if (options.diagnostics === undefined) compiler.configure(true);
			compatibilityEngine?.invalidate(id);
			if (configuration.invalidate(id) && change.event !== 'update') {
				await refreshConfiguration();
				invalidateDevelopmentModules?.();
			}

			compiler.diagnoseWatchChange(id, change.event === 'delete', (message) =>
				this.warn?.(message)
			);
		},
		closeBundle: async () => disposeBuildProcesses(),
		transform(code, id, hookOptions) {
			if (isExactViteCacheModule(id, viteCacheDir)) return null;
			const applicationRoot =
				configuration.registry?.applicationRoot ?? options.applicationRoot ?? process.cwd();
			const requestTarget = testModuleTargets.transform(code, id, hookOptions?.ssr, {
				root: applicationRoot,
				session: compiler.current,
				packageEnhancements: configuration.loaded?.packageEnhancements
			});
			ensureServerAuthorization(requestTarget);
			const configurationFiles = configuration.observeSource(exactModuleFilename(id));
			watchSourceConfiguration?.(configurationFiles);
			if (viteCommand === 'build')
				for (const file of configurationFiles) if (existsSync(file)) this.addWatchFile?.(file);
			// Rollup resolves a module's imports after this hook. Record every remote-scoped source here,
			// including precompiled package JavaScript that the compiler transform intentionally skips.
			microfrontends.recordModule(code, id);
			const transformed = transformExactViteModule({
				code,
				id,
				options,
				requestTarget,
				applicationRoot,
				compilerSession: compiler.current,
				packageEnhancements: configuration.loaded?.packageEnhancements ?? [],
				reactCompatibility,
				compatibilityEngine,
				configuredDebug,
				languageValidation: Boolean(languageValidation),
				viteCommand,
				componentAuthorization,
				inspectionModules,
				intl,
				recordMicrofrontendModule: (source, moduleId) =>
					microfrontends.recordModule(source, moduleId),
				warn: (message) => this.warn?.(message)
			});
			if (transformed)
				compiler.observeProjectFiles(exactModuleFilename(id), (files) =>
					files.forEach((file) => this.addWatchFile?.(file))
				);
			return finalizeExactViteTransform(transformed, languageValidation);
		}
	};
}
