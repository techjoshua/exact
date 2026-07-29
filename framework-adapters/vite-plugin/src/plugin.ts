import {
	createCompilerSession,
	createExactBuildInspectionCatalog,
	createExactInspectionBuildKey,
	createExactInspectionRedactions,
	createLineSourceMap,
	exactExportConditions,
	resolveNativeCompilerExecutable,
	resolveExactArtifactImport,
	transformSource,
	type ExactAssetRule,
	type ExactCompilerManifest,
	type ExactSourceInspection,
	type TransformTarget
} from '@exactjs/compiler';
import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';
import { createExactDiagnosticReporter } from '@exactjs/compiler/adapter-support';
import {
	profileTimestamp,
	type ExactProfileEvent,
	type ExactProfileSink
} from '@exactjs/instrumentation';
import type { ExactPreparedCompilerRegistry } from '@exactjs/plugin-api';
import {
	invalidateExactPluginRegistry,
	prepareExactPluginRegistry,
	type ExactPreparedPluginRegistry
} from '@exactjs/plugin-host/node';
import { createReactCompatibilityBuildEngine } from '@exactjs/react-compat/build';
import {
	jsxSourceOwnership,
	resolveReactCompatibility,
	validateInstalledReactReconciler,
	type ReactCompatibilityOptions
} from '@exactjs/react-compat/plugin';
import { transformReactJsx, usesReactRuntimeImports } from '@exactjs/react-compat/transform';
import path from 'node:path';
import {
	assertExactViteClientArtifactIsolation,
	type ExactRollupOutputLike
} from './artifact-isolation.js';
import { createExactViteMicrofrontendIntegration } from './microfrontends.js';
import {
	containsExactJsx,
	exactImportedManifests,
	exactModuleFilename,
	exactTransformTarget,
	isExactTransformableModule,
	shouldCompileExactModule
} from './module-selection.js';
import { rewriteWithCompatibility, viteReactAliases } from './react-compatibility-emission.js';

/** Configures exact plugin. */
export type ExactPluginOptions = {
	include?: FilterPattern;
	exclude?: FilterPattern;
	target?: TransformTarget;
	importedManifests?: readonly ExactCompilerManifest[];
	manifestFiles?: readonly string[];
	clientCondition?: string;
	serverCondition?: string;
	serverComponents?: boolean;
	sourceMap?: boolean;
	reactCompatibility?: boolean | ReactCompatibilityOptions;
	applicationRoot?: string;
	configPath?: string;
	pluginRegistry?: ExactPreparedCompilerRegistry;
	assetRules?: readonly ExactAssetRule[];
	diagnostics?: boolean;
	configureJsxRuntime?: boolean;
	compileTestModules?: boolean;
	onProfile?: ExactProfileSink;
	onRemoteEntries?: (entries: Readonly<Record<string, string>>) => void;
	onRemoteDevelopmentEntries?: (entries: Readonly<Record<string, string>>) => void;
	/** Derives server catalog emission and compact client runtime correlation together. */
	debug?: ExactViteDebugOptions;
};

/** Higher-level build controls for server-cooperative DevTools output. */
export type ExactViteDebugOptions = {
	catalog?: boolean | 'auto';
	runtime?: boolean | 'auto';
	buildKey?: string;
	executionRoot?: string;
	rootComponentId?: string;
	producer?: Readonly<{ packageName?: string; version?: string }>;
	redactions?: Partial<ExactInspectionRedactionCatalog>;
};

/** Reports an observable exact vite profile event. */
export type ExactViteProfileEvent = ExactProfileEvent<'vite-plugin', 'transform'>;

type FilterPattern = string | RegExp | readonly (string | RegExp)[];
const exactDevtoolsRuntimeModule = 'virtual:exact/devtools-runtime';
const resolvedExactDevtoolsRuntimeModule = `\0${exactDevtoolsRuntimeModule}`;

/** Defines the exact plugin type contract. */
export type ExactPlugin = {
	name: string;
	enforce: 'pre';
	warn?(message: string): void;
	config?(): {
		resolve: { conditions: string[]; alias?: Array<{ find: RegExp; replacement: string }> };
		oxc?: {
			jsx: {
				runtime: 'automatic';
				importSource: '@exactjs/jsx';
			};
		};
	};
	configResolved?(config: { command: 'build' | 'serve' }): void;
	buildStart?(this: {
		addWatchFile(file: string): void;
		warn?(message: string): void;
		emitFile?(file: {
			type: 'chunk' | 'asset';
			id?: string;
			name?: string;
			fileName?: string;
			source?: string;
			preserveSignature?: 'strict';
		}): string;
	}): void | Promise<void>;
	configureServer?(server: {
		httpServer?: { once(event: 'close', listener: () => void): unknown };
		watcher?: { once(event: 'close', listener: () => void): unknown };
	}): void;
	resolveId?(
		this: {
			warn?(message: string): void;
			resolve?(
				source: string,
				importer?: string,
				options?: { skipSelf?: boolean }
			): Promise<{ id: string; external?: boolean | 'absolute' | 'relative' } | null>;
		},
		source: string,
		importer?: string
	):
		| string
		| { id: string; external?: boolean | 'absolute' | 'relative' }
		| null
		| Promise<string | { id: string; external?: boolean | 'absolute' | 'relative' } | null>;
	load?(
		id: string
	):
		| string
		| { code: string; moduleType: 'js' | 'jsx' | 'ts' | 'tsx' }
		| null
		| Promise<string | { code: string; moduleType: 'js' | 'jsx' | 'ts' | 'tsx' } | null>;
	transform(
		this: { warn?(message: string): void },
		code: string,
		id: string
	): { code: string; map: unknown; moduleType?: 'js' } | null;
	handleHotUpdate?(this: { warn?(message: string): void }, context: { file: string }): void;
	watchChange?(
		this: { warn?(message: string): void },
		id: string,
		change: { event: 'create' | 'update' | 'delete' }
	): void;
	transformIndexHtml?: {
		order: 'pre';
		handler(html: string): string;
	};
	generateBundle?(
		this: {
			emitFile?(file: { type: 'asset'; fileName: string; source: string }): string;
		},
		_options: unknown,
		bundle: Readonly<Record<string, ExactRollupOutputLike>>
	): void;
	closeBundle?(): void;
};

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
					options,
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
			microfrontends.recordModule(code, id);
			const filename = exactModuleFilename(id);
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
					microfrontends.recordModule(rewritten.code, id);
					return {
						code: rewritten.code,
						map:
							options.sourceMap === false
								? null
								: createLineSourceMap(filename, code, rewritten.code),
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

function exactDevtoolsRuntimeBootstrap(debug: ExactViteDebugOptions | undefined): string {
	return `import { installExactDevtoolsRuntime } from '@exactjs/devtools-runtime';
const key = Symbol.for('@exactjs/devtools-installation');
globalThis[key] ??= installExactDevtoolsRuntime(${JSON.stringify({
		buildKey: debug?.buildKey ?? 'development',
		executionRoot: debug?.executionRoot ?? debug?.rootComponentId ?? 'page',
		...(debug?.redactions ? { redactions: debug.redactions } : {})
	})});
`;
}

function injectModuleBootstrap(html: string, moduleId: string): string {
	const bootstrap = `<script type="module" src=${JSON.stringify(moduleId)}></script>`;
	const firstModule = /<script\b(?=[^>]*\btype\s*=\s*["']module["'])[^>]*>/i;
	if (firstModule.test(html)) return html.replace(firstModule, `${bootstrap}$&`);
	const body = /<\/body\s*>/i;
	if (body.test(html)) return html.replace(body, `${bootstrap}$&`);
	return `${html}${bootstrap}`;
}

function inspectionCatalogEnabled(
	debug: ExactViteDebugOptions | undefined,
	command: 'build' | 'serve'
): boolean {
	const value = debug?.catalog ?? 'auto';
	return value === true || (value === 'auto' && command === 'serve');
}

function inspectionRuntimeEnabled(
	debug: ExactViteDebugOptions | undefined,
	command: 'build' | 'serve'
): boolean {
	const value = debug?.runtime ?? 'auto';
	return value === true || (value === 'auto' && command === 'serve');
}

function createViteInspectionCatalog(
	options: ExactPluginOptions,
	debug: ExactViteDebugOptions | undefined,
	modules: ReadonlyMap<
		string,
		Readonly<{
			inspection: ExactSourceInspection;
			manifest: ExactCompilerManifest;
			source: string;
		}>
	>,
	command: 'build' | 'serve'
) {
	if (!modules.size) return undefined;
	const root = path.resolve(options.applicationRoot ?? process.cwd());
	const entries = [...modules.entries()].map(([filename, entry]) => ({
		filename,
		source: entry.source
	}));
	const buildKey =
		debug?.buildKey ??
		(command === 'serve' ? 'development' : createExactInspectionBuildKey(root, entries));
	const inspections = [...modules.values()].map((entry) => entry.inspection);
	const rootComponentId =
		debug?.rootComponentId ?? inspections.flatMap((inspection) => inspection.components)[0]?.id;
	if (!rootComponentId) return undefined;
	const sources = Object.fromEntries(
		[...modules.entries()].map(([filename, entry]) => [filename, entry.source])
	);
	return createExactBuildInspectionCatalog({
		buildKey,
		root,
		...(debug?.producer ? { producer: debug.producer } : {}),
		roots: [
			{
				executionRoot: debug?.executionRoot ?? rootComponentId,
				rootComponentId,
				inspections,
				sources,
				redactions: createExactInspectionRedactions(
					[...modules.values()].map((entry) => entry.manifest),
					debug?.redactions
				)
			}
		]
	});
}

function validateViteDebugIdentity(
	debug: ExactViteDebugOptions | undefined,
	command: 'build' | 'serve'
): void {
	if (
		command === 'build' &&
		(debug?.catalog === true || debug?.runtime === true) &&
		!debug.buildKey
	)
		throw new Error(
			'eXact production DevTools output requires one explicit immutable debug.buildKey'
		);
}
