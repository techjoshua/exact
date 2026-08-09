import { inspectExactComponentBuildFacts, resolveExactArtifactImport } from '@exactjs/compiler';
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
import { exactViteConfig } from './vite-config.js';
import {
	createViteInspectionCatalog,
	exactDevtoolsRuntimeBootstrap,
	exactDevtoolsRuntimeModule,
	injectModuleBootstrap,
	inspectionCatalogEnabled,
	inspectionRuntimeEnabled,
	resolvedExactDevtoolsRuntimeModule,
	validateViteDebugIdentity
} from './debug-output.js';
import type { ExactPlugin, ExactPluginOptions } from './plugin-contracts.js';
import { exactEnhancementFacades } from './enhancement-catalog.js';
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

/** Creates the Vite plugin that transforms eXact JSX and resolves .exact facade imports. */
export function exact(options: ExactPluginOptions = {}): ExactPlugin {
	const compiler = new ExactViteCompilerSession(options.diagnostics ?? false, options.onProfile);
	const diagnosticReporter = createExactDiagnosticReporter();
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
	let languageValidation: ExactLanguageValidationSession | undefined;
	const componentAuthorization = new ExactViteComponentAuthorization();
	let viteCommand: 'build' | 'serve' = 'build';
	let configuredDebug = options.debug;
	const inspectionModules = new Map<string, ExactViteInspectionRecord>();
	const intl = new IntlBuildCoordinator({
		applicationRoot: options.applicationRoot,
		configuration: options.internationalization || undefined,
		target: options.target === 'server' ? 'server' : 'client'
	});
	const disposeBuildProcesses = (): void => {
		componentAuthorization.dispose();
		compiler.dispose();
		intl.dispose();
		void languageValidation?.dispose();
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
		config() {
			return exactViteConfig(options, reactCompatibility);
		},
		configResolved(config) {
			viteCommand = config.command;
			compiler.configure(options.diagnostics ?? config.command === 'serve');
		},
		async buildStart() {
			inspectionModules.clear();
			for (const file of compatibilityEngine?.watchFiles ?? []) this.addWatchFile(file);
			await intl.beginBuild();
			for (const file of intl.catalogFiles) this.addWatchFile(file);
			const registry = await prepareRegistry();
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
			server.httpServer?.once('close', disposeBuildProcesses);
			server.watcher?.once('close', disposeBuildProcesses);
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
			if (inspectionCatalogEnabled(configuredDebug, viteCommand)) {
				const catalog = createViteInspectionCatalog(
					options.applicationRoot,
					configuredDebug,
					inspectionModules,
					viteCommand,
					committed.audit
				);
				if (catalog)
					this.emitFile({
						type: 'asset',
						fileName: `.exact-inspection/${catalog.buildKey}.json`,
						source: `${JSON.stringify(catalog, null, 2)}\n`
					});
			}
			this.emitFile({
				type: 'asset',
				fileName: '.exact/component-library-authorization.json',
				source: `${JSON.stringify(committed.manifest, null, 2)}\n`
			});
			this.emitFile({
				type: 'asset',
				fileName: '.exact/component-library-audit.json',
				source: `${JSON.stringify(committed.audit, null, 2)}\n`
			});
		},
		resolveId(source, importer) {
			const intlModule = intl.resolve(source);
			if (intlModule) return { id: intlModule, moduleSideEffects: false };
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
			const intlModule = intl.load(id);
			if (intlModule) return { code: intlModule.code, moduleType: 'js' };
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
					const authorizationOptions = {
						applicationRoot: registry.applicationRoot,
						executionReason: options.serverExecutionReason,
						watch: (file: string) => this.addWatchFile?.(file)
					};
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
		closeBundle: disposeBuildProcesses,
		transform(code, id) {
			const transformed = transformExactViteModule({
				code,
				id,
				options,
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
			if (!transformed) return null;
			const { languageProjection: _languageProjection, ...result } = transformed;
			return transformed.languageProjection && languageValidation
				? languageValidation.validate([transformed.languageProjection]).then(() => result)
				: result;
		}
	};
}
