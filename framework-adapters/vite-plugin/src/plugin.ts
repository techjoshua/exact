import {
	createCompilerSession,
	createLineSourceMap,
	exactExportConditions,
	resolveExactArtifactImport,
	transformSource,
	type ExactAssetRule,
	type ExactCompilerManifest,
	type TransformTarget
} from '@exact/compiler';
import {
	createExactDiagnosticReporter,
	loadExactImportedManifests,
	matchesExactBuildFilter
} from '@exact/compiler/adapter-support';
import {
	profileTimestamp,
	type ExactProfileEvent,
	type ExactProfileSink
} from '@exact/instrumentation';
import type { ExactPreparedCompilerRegistry } from '@exact/plugin-api';
import {
	invalidateExactPluginRegistry,
	prepareExactPluginRegistry,
	type ExactPreparedPluginRegistry
} from '@exact/plugin-host/node';
import {
	createReactCompatibilityBuildEngine,
	type ReactCompatibilityBuildEngine
} from '@exact/react-compat/build';
import {
	jsxSourceOwnership,
	resolveReactCompatibility,
	validateInstalledReactReconciler,
	type ReactCompatibilityOptions,
	type ResolvedReactCompatibility
} from '@exact/react-compat/plugin';
import { transformReactJsx, usesReactRuntimeImports } from '@exact/react-compat/transform';
import path from 'node:path';

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
	onProfile?: ExactProfileSink;
	onRemoteEntries?: (entries: Readonly<Record<string, string>>) => void;
	onRemoteDevelopmentEntries?: (entries: Readonly<Record<string, string>>) => void;
};

/** Reports an observable exact vite profile event. */
export type ExactViteProfileEvent = ExactProfileEvent<'vite-plugin', 'transform'>;

type FilterPattern = string | RegExp | readonly (string | RegExp)[];

type ExactRemoteRollupAdapterLike = {
	readonly pageBootstrapImport: string;
	readonly developmentEntries: Readonly<Record<string, string>>;
	buildStart(context: {
		emitFile(file: {
			type: 'chunk';
			id: string;
			name: string;
			preserveSignature: 'strict';
		}): string;
	}): void;
	recordModule(code: string, id: string): void;
	resolveId(
		source: string,
		importer?: string,
		resolve?: (
			source: string,
			importer?: string
		) => Promise<{ id: string; external?: boolean | 'absolute' | 'relative' } | null>
	):
		| string
		| { id: string; external?: boolean | 'absolute' | 'relative' }
		| null
		| Promise<string | { id: string; external?: boolean | 'absolute' | 'relative' } | null>;
	load(id: string): string | null;
	generateBundle(bundle: Readonly<Record<string, ExactRollupOutputLike>>): void;
};

type ExactRollupOutputLike = {
	type: 'chunk' | 'asset';
	fileName: string;
	facadeModuleId?: string | null;
	isEntry?: boolean;
};

type ExactMicrofrontendsRollupModule = {
	readExactMicrofrontendCompilerConfig(value: unknown): unknown;
	prepareExactRemoteArtifactBuild(options: {
		applicationRoot: string;
		compilerConfig: unknown;
		pluginRegistry: ExactPreparedCompilerRegistry;
		serverComponents?: boolean;
	}): Promise<{
		plan: { exposures: readonly unknown[] };
		artifactGraph?: unknown;
		hasRemoteBindings: boolean;
	}>;
	createExactRemoteRollupAdapter(options: {
		plan: unknown;
		applicationRoot: string;
		artifactGraph?: unknown;
		registrationModules?: Readonly<Record<string, string>>;
		onEntries?: (entries: Readonly<Record<string, string>>) => void;
	}): ExactRemoteRollupAdapterLike;
};

/** Defines the exact plugin type contract. */
export type ExactPlugin = {
	name: string;
	enforce: 'pre';
	warn?(message: string): void;
	config?(): {
		resolve: { conditions: string[]; alias?: Array<{ find: RegExp; replacement: string }> };
	};
	configResolved?(config: { command: 'build' | 'serve' }): void;
	buildStart?(this: {
		addWatchFile(file: string): void;
		warn?(message: string): void;
		emitFile?(file: {
			type: 'chunk';
			id: string;
			name: string;
			preserveSignature: 'strict';
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
	load?(id: string): string | null;
	transform(
		this: { warn?(message: string): void },
		code: string,
		id: string
	): { code: string; map: unknown } | null;
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
	generateBundle?(_options: unknown, bundle: Readonly<Record<string, ExactRollupOutputLike>>): void;
	closeBundle?(): void;
};

/** Creates the Vite plugin that transforms eXact JSX and resolves .exact facade imports. */
export function exact(options: ExactPluginOptions = {}): ExactPlugin {
	let diagnosticsEnabled = options.diagnostics ?? false;
	let compilerSession = createCompilerSession({
		languageService: diagnosticsEnabled,
		onProfile: options.onProfile
	});
	const diagnosticReporter = createExactDiagnosticReporter();
	const configureDiagnostics = (enabled: boolean): void => {
		if (enabled === diagnosticsEnabled) return;
		compilerSession.dispose();
		diagnosticsEnabled = enabled;
		compilerSession = createCompilerSession({
			languageService: enabled,
			onProfile: options.onProfile
		});
	};
	const compatibilityCwd =
		typeof options.reactCompatibility === 'object' ? options.reactCompatibility.cwd : undefined;
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
	let remoteAdapter: ExactRemoteRollupAdapterLike | undefined;
	let publishProvidedPackages = false;
	const prepareRegistry = async (): Promise<ExactPreparedPluginRegistry> => {
		if (preparedRegistry) return preparedRegistry;
		preparedRegistry = await prepareExactPluginRegistry({
			applicationRoot: options.applicationRoot,
			configPath: options.configPath,
			hostMode: 'compiler'
		});
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
				}
			};
		},
		configResolved(config) {
			configureDiagnostics(options.diagnostics ?? config.command === 'serve');
		},
		async buildStart() {
			for (const file of compatibilityEngine?.watchFiles ?? []) this.addWatchFile(file);
			const registry = await prepareRegistry();
			for (const file of registry.watchFiles) this.addWatchFile(file);
			for (const warning of registry.warnings) this.warn?.(warning);
			if (options.target !== 'server') {
				const remotePlugin = registry.compiler.plugins['@exact/microfrontends'];
				if (remotePlugin) {
					const integration = (await import(
						'@exact/microfrontends/rollup'
					)) as unknown as ExactMicrofrontendsRollupModule;
					const compilerConfig = integration.readExactMicrofrontendCompilerConfig(
						remotePlugin.cacheKey
					);
					const prepared = await integration.prepareExactRemoteArtifactBuild({
						applicationRoot: registry.applicationRoot,
						compilerConfig,
						pluginRegistry: registry.compiler,
						serverComponents: options.serverComponents
					});
					remoteAdapter = integration.createExactRemoteRollupAdapter({
						plan: prepared.plan,
						applicationRoot: registry.applicationRoot,
						...(prepared.artifactGraph
							? { artifactGraph: prepared.artifactGraph }
							: { registrationModules: {} }),
						onEntries: options.onRemoteEntries
					});
					options.onRemoteDevelopmentEntries?.(remoteAdapter.developmentEntries);
					publishProvidedPackages = prepared.hasRemoteBindings;
					if (!this.emitFile)
						throw new Error('Vite/Rollup emitFile is unavailable for remote entries');
					remoteAdapter.buildStart({ emitFile: (file) => this.emitFile!(file) });
				}
			}
		},
		configureServer(server) {
			server.httpServer?.once('close', () => compilerSession.dispose());
			server.watcher?.once('close', () => compilerSession.dispose());
		},
		resolveId(source, importer) {
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
			if (!remoteAdapter) return resolveFrameworkImport();
			return Promise.resolve(
				remoteAdapter.resolveId(source, importer, (request, owner) =>
					this.resolve ? this.resolve(request, owner, { skipSelf: true }) : Promise.resolve(null)
				)
			).then((remote) => remote ?? resolveFrameworkImport());
		},
		load(id) {
			return remoteAdapter?.load(id) ?? null;
		},
		transformIndexHtml: {
			order: 'pre',
			handler(html) {
				if (!publishProvidedPackages || !remoteAdapter) return html;
				return injectProvidedPackageBootstrap(html, remoteAdapter.pageBootstrapImport);
			}
		},
		generateBundle(_output, bundle) {
			remoteAdapter?.generateBundle(bundle);
		},
		handleHotUpdate(context) {
			if (options.diagnostics === undefined) configureDiagnostics(true);
			compatibilityEngine?.invalidate(context.file);
			if (preparedRegistry?.watchFiles.includes(path.resolve(context.file))) {
				invalidateExactPluginRegistry(preparedRegistry.applicationRoot);
				preparedRegistry = undefined;
			}
			// Semantic changes can originate in imported .ts/.d.ts files or the
			// project config even when that file itself contains no JSX.
			if (/(?:^|[\\/])tsconfig(?:\.[^\\/]+)?\.json$/i.test(context.file)) compilerSession.clear();
			else
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
			if (/(?:^|[\\/])tsconfig(?:\.[^\\/]+)?\.json$/i.test(id)) compilerSession.clear();
			else
				diagnosticReporter(compilerSession.invalidate(id, change.event === 'delete'), (message) =>
					this.warn?.(message)
				);
		},
		closeBundle() {
			compilerSession.dispose();
		},
		transform(code, id) {
			if (!isTransformableModule(id)) return null;
			remoteAdapter?.recordModule(code, id);
			const filename = moduleFilename(id);
			const profileStarted = options.onProfile ? profileTimestamp() : undefined;
			try {
				const ownership = jsxSourceOwnership(filename, code, reactCompatibility);
				const reactOwned =
					ownership === 'react' ||
					(ownership === 'unknown' && usesReactRuntimeImports(code, filename));
				if (reactOwned && containsJsx(filename, code)) {
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
						options,
						code
					);
					remoteAdapter?.recordModule(rewritten.code, id);
					return rewritten;
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
						target: targetFor(options),
						importedManifests: importedManifestsFor(options),
						serverComponents: options.serverComponents,
						sourceMap: false,
						assetRules: options.assetRules,
						preserveClientAssetImports: true,
						pluginRegistry: options.pluginRegistry ?? preparedRegistry?.compiler
					});
					const rewritten = compatibilityEngine
						? compatibilityEngine.transformModule({
								id: filename,
								source: result.code,
								format: 'module',
								target: options.target === 'server' ? 'server' : 'client',
								sourceMap: false
							})
						: { code: result.code };
					remoteAdapter?.recordModule(rewritten.code, id);
					return {
						code: rewritten.code,
						map:
							options.sourceMap === false
								? null
								: createLineSourceMap(filename, code, rewritten.code)
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
				if (rewritten.changed) remoteAdapter?.recordModule(rewritten.code, id);
				return rewritten.changed ? { code: rewritten.code, map: rewritten.map } : null;
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

function moduleFilename(id: string): string {
	return id.startsWith('\0') ? id : id.split('?', 1)[0]!;
}

function injectProvidedPackageBootstrap(html: string, moduleId: string): string {
	const bootstrap = `<script type="module" src=${JSON.stringify(moduleId)}></script>`;
	const firstModule = /<script\b(?=[^>]*\btype\s*=\s*["']module["'])[^>]*>/i;
	if (firstModule.test(html)) return html.replace(firstModule, `${bootstrap}$&`);
	const body = /<\/body\s*>/i;
	if (body.test(html)) return html.replace(body, `${bootstrap}$&`);
	return `${html}${bootstrap}`;
}

function targetFor(options: ExactPluginOptions): 'client' | 'server' {
	return options.target === 'server' ? 'server' : 'client';
}

function importedManifestsFor(options: {
	importedManifests?: readonly ExactCompilerManifest[];
	manifestFiles?: readonly string[];
}): ExactCompilerManifest[] {
	return loadExactImportedManifests(options);
}

function shouldCompileExactModule(
	id: string,
	code: string,
	options: ExactPluginOptions,
	registry: ExactPreparedCompilerRegistry | undefined
): boolean {
	if (!options.include && /(?:^|[\\/])node_modules(?:[\\/]|$)/.test(id)) return false;
	if (options.include && !matchesExactBuildFilter(id, options.include)) return false;
	if (options.exclude && matchesExactBuildFilter(id, options.exclude)) return false;
	return (
		containsJsx(id, code) ||
		/@exact\s+[A-Za-z_$][\w$-]*\.[A-Za-z_$][\w$-]*/.test(code) ||
		Object.values(registry?.plugins ?? {}).some((plugin) => {
			const include = plugin.extension?.include;
			if (!include) return false;
			include.lastIndex = 0;
			return include.test(id);
		})
	);
}

function isTransformableModule(id: string): boolean {
	return /\.[cm]?[jt]sx?(?:$|\?)/i.test(id);
}

function containsJsx(id: string, code: string): boolean {
	return /\.[jt]sx(?:$|\?)/i.test(id) && code.includes('<');
}

function rewriteWithCompatibility(
	engine: ReactCompatibilityBuildEngine,
	lowered: string,
	id: string,
	options: ExactPluginOptions,
	original: string
): { code: string; map: unknown } {
	const rewritten = engine.transformModule({
		id,
		source: lowered,
		format: 'module',
		target: options.target === 'server' ? 'server' : 'client',
		sourceMap: false
	});
	return {
		code: rewritten.code,
		map: options.sourceMap === false ? null : createLineSourceMap(id, original, rewritten.code)
	};
}

function viteReactAliases(
	resolved: ResolvedReactCompatibility
): Array<{ find: RegExp; replacement: string }> {
	return Object.entries(resolved.aliases).map(([find, replacement]) => ({
		find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
		replacement
	}));
}
