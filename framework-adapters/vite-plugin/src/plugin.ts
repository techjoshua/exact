import {
	createCompilerSession,
	createLineSourceMap,
	exactExportConditions,
	resolveNativeCompilerExecutable,
	resolveExactArtifactImport,
	type ExactSourceInspection
} from '@exactjs/compiler';
import type { ExactComponentBuildFacts } from '@exactjs/compiler';
import {
	createExactComponentAuthorizationSession,
	recordExactNodeComponentProvenance,
	type ExactComponentAuthorizationSession,
	type ExactResolvedComponentCandidate
} from '@exactjs/component-library-policy';
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
import { createHash } from 'node:crypto';
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
	exactEnhancementFacades,
	prependViteEnhancementRegistrations
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
	let authorizationSession: ExactComponentAuthorizationSession | undefined;
	const componentFacts = new Map<
		string,
		Readonly<{ facts: ExactComponentBuildFacts; version: string }>
	>();
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
			hostMode: 'build'
		});
		configuredDebug ??= preparedRegistry.config?.debug;
		return preparedRegistry;
	};
	const openAuthorizationGeneration = (registry: ExactPreparedPluginRegistry): void => {
		authorizationSession?.dispose();
		authorizationSession = createExactComponentAuthorizationSession({
			buildKey: viteAuthorizationBuildKey(registry.applicationRoot, configuredDebug?.buildKey),
			config: registry.config?.componentLibraries
		});
		for (const [moduleId, record] of componentFacts)
			authorizationSession.recordImporterFacts(moduleId, record.facts, record.version);
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
				if (
					!viteRequiresComponentAuthorization(
						source,
						importer,
						componentFacts,
						authorizationSession
					)
				)
					return resolved;
				return Promise.resolve(resolved).then((value) =>
					authorizeViteComponentResolution(
						value,
						source,
						importer,
						componentFacts,
						authorizationSession,
						preparedRegistry?.applicationRoot ?? options.applicationRoot ?? process.cwd(),
						(file) => this.addWatchFile?.(file)
					)
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
			if (
				!viteRequiresComponentAuthorization(source, importer, componentFacts, authorizationSession)
			)
				return resolved;
			return Promise.resolve(resolved)
				.then((value) =>
					value ??
					(this.resolve ? this.resolve(source, importer, { skipSelf: true }) : null)
				)
				.then((value) =>
					authorizeViteComponentResolution(
						value,
						source,
						importer,
						componentFacts,
						authorizationSession,
						preparedRegistry?.applicationRoot ?? options.applicationRoot ?? process.cwd(),
						(file) => this.addWatchFile?.(file)
					)
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
			if (options.target === 'server' && authorizationSession) {
				if (!this.emitFile)
					throw new Error('Vite/Rollup emitFile is unavailable for component authorization');
				const emitFile = this.emitFile.bind(this);
				return authorizationSession.commitGeneration().then((committed) => {
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
			}
			// The compiler session owns watch-file classification so every
			// integration applies the same source, project, and asset rules.
			diagnosticReporter(compilerSession.invalidate(context.file), (message) =>
				this.warn?.(message)
			);
			if (options.target === 'server') {
				authorizationSession?.rejectGeneration();
				componentFacts.delete(exactModuleFilename(context.file));
				openAuthorizationGeneration(await prepareRegistry());
			}
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
			authorizationSession?.dispose();
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
				shouldCompile: shouldCompileExactBuildModule(filename, code, options),
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
						jsxInterop: compatibilityEngine?.jsxInterop,
						emitInspection:
							options.target === 'server' && inspectionCatalogEnabled(configuredDebug, viteCommand),
						instrumentInspection: inspectionRuntimeEnabled(configuredDebug, viteCommand)
					},
					finish: (result) => {
						const version = sourceVersion(code);
						componentFacts.set(filename, Object.freeze({ facts: result.componentBuild, version }));
						if (options.target === 'server' && authorizationSession)
							authorizationSession.recordImporterFacts(filename, result.componentBuild, version);
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

async function authorizeViteComponentResolution(
	resolved: string | { id: string; external?: boolean | 'absolute' | 'relative' } | null,
	source: string,
	importer: string | undefined,
	factsByModule: ReadonlyMap<
		string,
		Readonly<{ facts: ExactComponentBuildFacts; version: string }>
	>,
	session: ExactComponentAuthorizationSession | undefined,
	applicationRoot: string,
	watch: (file: string) => void
): Promise<string | { id: string; external?: boolean | 'absolute' | 'relative' } | null> {
	if (!resolved || !importer || !session) return resolved;
	const importerModuleId = exactModuleFilename(importer);
	const importerRecord = factsByModule.get(importerModuleId);
	if (!importerRecord) return resolved;
	const componentEdge = importerRecord.facts.componentImports.find(
		(edge) => edge.moduleSpecifier === source && edge.artifactTargets.includes('server')
	);
	const enhancementEdge = importerRecord.facts.rendererEnhancements.find(
		(edge) => edge.moduleSpecifier === source
	);
	if (!componentEdge && !enhancementEdge) return resolved;
	const resolvedModuleId = typeof resolved === 'string' ? resolved : resolved.id;
	const provenance = await recordExactNodeComponentProvenance({
		session,
		applicationRoot,
		importerModuleId,
		moduleSpecifier: source,
		resolvedModuleId
	});
	for (const file of provenance.watchFiles) watch(file);
	const candidate: ExactResolvedComponentCandidate = Object.freeze({
		importerModuleId,
		moduleSpecifier: source,
		exportName: componentEdge?.exportName ?? enhancementEdge!.exportName,
		resolvedModuleId,
		packageInstanceKey: provenance.instance.key,
		reason: enhancementEdge ? 'server-enhancement' : serverReason(componentEdge!.reason),
		...(enhancementEdge ? { optionalEnhancementIdentity: enhancementEdge.identity } : {})
	});
	const authorization = await session.authorizeResolvedComponent(candidate);
	return authorization.outcome === 'omitted' ? null : resolved;
}

function viteRequiresComponentAuthorization(
	source: string,
	importer: string | undefined,
	factsByModule: ReadonlyMap<
		string,
		Readonly<{ facts: ExactComponentBuildFacts; version: string }>
	>,
	session: ExactComponentAuthorizationSession | undefined
): boolean {
	if (!importer || !session) return false;
	const facts = factsByModule.get(exactModuleFilename(importer))?.facts;
	return (
		facts?.componentImports.some(
			(edge) => edge.moduleSpecifier === source && edge.artifactTargets.includes('server')
		) === true ||
		facts?.rendererEnhancements.some((edge) => edge.moduleSpecifier === source) === true
	);
}

function serverReason(
	reason: ExactComponentBuildFacts['componentImports'][number]['reason']
): ExactResolvedComponentCandidate['reason'] {
	if (reason === 'enhancement') return 'server-enhancement';
	if (reason === 'task-owner') return 'server-task';
	if (reason === 'continuation') return 'server-component';
	return 'ssr';
}

function sourceVersion(source: string): string {
	return createHash('sha256').update(source).digest('base64url');
}

function viteAuthorizationBuildKey(applicationRoot: string, configured?: string): string {
	return (
		configured ??
		`vite-${createHash('sha256').update(path.resolve(applicationRoot)).digest('base64url')}`
	);
}
