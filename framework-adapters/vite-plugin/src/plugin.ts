import { inspectExactComponentBuildFacts } from '@exactjs/compiler';
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
import path from 'node:path';
import { assertExactViteClientArtifactIsolation } from './artifact-isolation.js';
import { createExactViteAuthorizationOptions } from './authorization-options.js';
import { createExactViteMicrofrontendIntegration } from './microfrontends.js';
import {
	assertExactViteBuildTarget,
	exactModuleFilename,
	exactTransformTarget,
	exactViteRequestTarget
} from './module-selection.js';
import { exactViteConfig } from './vite-config.js';
import {
	exactDevtoolsRuntimeBootstrap,
	exactDevtoolsRuntimeModule,
	injectModuleBootstrap,
	inspectionRuntimeEnabled,
	resolvedExactDevtoolsRuntimeModule,
	validateViteDebugIdentity
} from './debug-output.js';
import type { ExactPlugin, ExactPluginOptions } from './plugin-contracts.js';
import {
	ExactViteEnhancementFacadeCatalog,
	resolveExactViteEnhancementRequest
} from './enhancement-catalog.js';
import { IntlBuildCoordinator } from '@exactjs/intl-build';
import {
	ExactViteComponentAuthorization,
	isExactViteOmittedEnhancement
} from './component-authorization.js';
import { transformExactViteModule, type ExactViteInspectionRecord } from './transform.js';
import {
	createExactLanguageValidationSession,
	type ExactLanguageValidationSession
} from '@exactjs/language-extension-host';
import { ExactViteCompilerSession } from './compiler-session.js';
import { emitExactViteServerArtifacts } from './server-artifacts.js';
import { createExactViteReactCompatibility } from './react-compatibility.js';
import {
	isCompiledTestResolution,
	resolveExactTestTargetRequest
} from './test-module-selection.js';
import { resolveExactFrameworkImport } from './framework-import.js';
import { attachExactViteServerDisposal } from './server-lifecycle.js';
import { finalizeExactViteTransform } from './transform-result.js';

/** Creates the Vite plugin that transforms eXact JSX and resolves .exact facade imports. */
export function exact(options: ExactPluginOptions = {}): ExactPlugin {
	const compiler = new ExactViteCompilerSession(options.diagnostics ?? false, options.onProfile);
	const diagnosticReporter = createExactDiagnosticReporter();
	const { compatibility: reactCompatibility, engine: compatibilityEngine } =
		createExactViteReactCompatibility(options);
	let preparedRegistry: ExactPreparedPluginRegistry | undefined;
	let loadedConfig: ExactLoadedConfig | undefined;
	let languageValidation: ExactLanguageValidationSession | undefined;
	let disposed = false;
	const componentAuthorization = new ExactViteComponentAuthorization();
	const enhancementFacadeCatalog = new ExactViteEnhancementFacadeCatalog();
	let viteCommand: 'build' | 'serve' = 'build';
	let configuredDebug = options.debug;
	const inspectionModules = new Map<string, ExactViteInspectionRecord>();
	const intl = new IntlBuildCoordinator({
		applicationRoot: options.applicationRoot,
		configuration: options.internationalization || undefined,
		target: options.target === 'server' ? 'server' : 'client'
	});
	const disposeBuildProcesses = async (): Promise<void> => {
		disposed = true;
		componentAuthorization.dispose();
		compiler.dispose();
		intl.dispose();
		await languageValidation?.dispose();
		languageValidation = undefined;
	};
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
			buildKey: configuredDebug?.buildKey ?? (viteCommand === 'serve' ? 'development' : undefined),
			config: loadedConfig?.config?.componentLibraries
		});
	};
	return {
		name: 'exact',
		enforce: 'pre',
		config: () => exactViteConfig(options, reactCompatibility),
		configResolved(config) {
			viteCommand = config.command;
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
			await languageValidation?.dispose();
			languageValidation = createExactLanguageValidationSession({
				workspaceRoot: registry.applicationRoot,
				config: loadedConfig?.config?.languageExtensions
			});
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
			const requestTarget = exactViteRequestTarget(options, hookOptions?.ssr);
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
			const enhancement = await resolveExactViteEnhancementRequest({
				catalog: enhancementFacadeCatalog,
				source,
				importer,
				resolve: async (request, owner) =>
					this.resolve ? this.resolve(request, owner, { skipSelf: true }) : null,
				authorize: (resolved, request, owner) =>
					isCompiledTestResolution(resolved, options)
						? Promise.resolve(resolved)
						: componentAuthorization.authorize(
								resolved,
								request,
								owner,
								createExactViteAuthorizationOptions(
									options,
									preparedRegistry?.applicationRoot ?? options.applicationRoot ?? process.cwd(),
									(file) => this.addWatchFile?.(file)
								)
							),
				requires: (request, owner) => componentAuthorization.requires(request, owner),
				activationModule:
					requestTarget === 'server' ? undefined : '@exactjs/dom/framework/enhancements',
				useRuntimeFacades: requestTarget === 'server'
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
					hookOptions?.ssr
				);
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
					componentAuthorization.authorize(
						value,
						source,
						importer,
						createExactViteAuthorizationOptions(
							options,
							preparedRegistry?.applicationRoot ?? options.applicationRoot ?? process.cwd(),
							(file) => this.addWatchFile?.(file)
						)
					)
				);
		},
		load(id) {
			const intlModule = intl.load(id);
			if (intlModule) return { code: intlModule.code, moduleType: 'js' };
			const enhancementFacade = enhancementFacadeCatalog.load(id);
			if (enhancementFacade) return { code: enhancementFacade, moduleType: 'js' };
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
			microfrontends.generateBundle(bundle);
		},
		async handleHotUpdate(context) {
			intl.advanceGeneration();
			if (intl.isCatalogFile(context.file)) {
				await intl.refreshCatalogGeneration();
				const affected: unknown[] = [];
				for (const id of intl.modules.keys()) {
					const module = context.server?.moduleGraph?.getModuleById(id);
					if (!module) continue;
					context.server?.moduleGraph?.invalidateModule(module);
					affected.push(module);
				}
				return affected;
			}
			intl.invalidateSource(exactModuleFilename(context.file));
			if (options.diagnostics === undefined) compiler.configure(true);
			compatibilityEngine?.invalidate(context.file);
			if (preparedRegistry?.watchFiles.includes(path.resolve(context.file))) {
				invalidateExactPluginRegistry(preparedRegistry.applicationRoot);
				preparedRegistry = undefined;
				loadedConfig = undefined;
			}
			// The compiler session owns watch-file classification so every
			// integration applies the same source, project, and asset rules.
			diagnosticReporter(compiler.current.invalidate(context.file), (message) =>
				this.warn?.(message)
			);
			if (options.target === 'server') {
				const filename = exactModuleFilename(context.file);
				const previous = componentAuthorization.invalidate(filename);
				const registry = await prepareRegistry();
				openAuthorizationGeneration(registry);
				try {
					const authorizationOptions = createExactViteAuthorizationOptions(
						options,
						registry.applicationRoot,
						(file) => this.addWatchFile?.(file)
					);
					await componentAuthorization.revalidate(
						authorizationOptions,
						componentAuthorization.watches(context.file) ? undefined : filename
					);
					if (context.read && shouldTransformExactBuildModulePath(filename, options)) {
						const source = await context.read();
						if (shouldCompileExactBuildModule(filename, source, options)) {
							if (!context.server?.pluginContainer?.resolveId)
								throw new Error(
									`Vite cannot preflight component imports for changed module ${filename}`
								);
							const facts = inspectExactComponentBuildFacts(source, {
								session: compiler.current,
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
								await componentAuthorization.authorize(
									resolved,
									request,
									filename,
									authorizationOptions
								);
							}
						}
					}
					await componentAuthorization.commit();
					openAuthorizationGeneration(registry);
				} catch (error) {
					componentAuthorization.reject();
					componentAuthorization.restore(filename, previous);
					openAuthorizationGeneration(registry);
					throw error;
				}
			}
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
			if (preparedRegistry?.watchFiles.includes(path.resolve(id))) {
				invalidateExactPluginRegistry(preparedRegistry.applicationRoot);
				preparedRegistry = undefined;
				loadedConfig = undefined;
			}
			diagnosticReporter(compiler.current.invalidate(id, change.event === 'delete'), (message) =>
				this.warn?.(message)
			);
		},
		closeBundle: async () => disposeBuildProcesses(),
		transform(code, id, hookOptions) {
			// Rollup resolves a module's imports after this hook. Record every remote-scoped source here,
			// including precompiled package JavaScript that the compiler transform intentionally skips.
			microfrontends.recordModule(code, id);
			const transformed = transformExactViteModule({
				code,
				id,
				options,
				requestTarget: exactViteRequestTarget(options, hookOptions?.ssr),
				applicationRoot:
					preparedRegistry?.applicationRoot ?? options.applicationRoot ?? process.cwd(),
				compilerSession: compiler.current,
				packageEnhancements: loadedConfig?.packageEnhancements ?? [],
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
			return finalizeExactViteTransform(transformed, languageValidation);
		}
	};
}
