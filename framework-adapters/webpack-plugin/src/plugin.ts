import {
	createLineSourceMap,
	exactExportConditions,
	type ExactAssetRule,
	type ExactCompilerSession,
	type TransformTarget
} from '@exactjs/compiler';
import {
	createExactDiagnosticReporter,
	prependExactEnhancementRegistrations,
	transformExactAdapterModule
} from '@exactjs/compiler/adapter-support';
import { type ExactProfileEvent, type ExactProfileSink } from '@exactjs/instrumentation';
import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';
import { prepareExactPluginRegistry } from '@exactjs/plugin-host/node';
import {
	jsxSourceOwnership,
	resolveReactCompatibility,
	type ReactCompatibilityOptions
} from '@exactjs/react-compat/plugin';
import { transformReactJsx, usesReactRuntimeImports } from '@exactjs/react-compat/transform';
import path from 'node:path';
import {
	createWebpackCompilerSession,
	clearWebpackInspectionModules,
	disposeWebpackCompilerSession,
	replaceWebpackCompilerSession,
	webpackCompilerSession,
	recordWebpackInspectionModule,
	webpackInspectionCatalog
} from './sessions.js';
import { webpackCompatibilityEngine } from './react-compatibility.js';
import { shouldTransformWebpackModule, webpackTransformTarget } from './transform-selection.js';
import {
	addWebpackConditions,
	addWebpackEnhancementAliases,
	addWebpackReactAliases,
	applyExactWebpackResolver
} from './resolver.js';
import {
	appendWebpackDevtoolsBootstrap,
	resolveWebpackDebug,
	webpackDebugEnabled
} from './devtools.js';
export {
	addWebpackConditions,
	addWebpackEnhancementAliases,
	addWebpackReactAliases,
	applyExactWebpackResolver,
	resolveExactWebpackRequest
} from './resolver.js';

/** Configures exact webpack plugin. */
export type ExactWebpackPluginOptions = {
	target?: TransformTarget;
	clientCondition?: string;
	serverCondition?: string;
	include?: FilterPattern;
	exclude?: FilterPattern;
	serverComponents?: boolean;
	sourceMap?: boolean;
	reactCompatibility?: boolean | ReactCompatibilityOptions;
	applicationRoot?: string;
	configPath?: string;
	assetRules?: readonly ExactAssetRule[];
	diagnostics?: boolean;
	onProfile?: ExactProfileSink;
	/** Independent server catalog and compact runtime controls. */
	debug?: ExactWebpackDebugOptions;
	/** @internal Loader-owned compiler session identity. */
	__exactSessionId?: string;
};

/** Higher-level Webpack controls for server-cooperative DevTools output. */
export type ExactWebpackDebugOptions = {
	catalog?: boolean | 'auto';
	runtime?: boolean | 'auto';
	buildKey?: string;
	executionRoot?: string;
	rootComponentId?: string;
	producer?: Readonly<{ packageName?: string; version?: string }>;
	redactions?: Partial<ExactInspectionRedactionCatalog>;
};

/** Reports an observable exact webpack profile event. */
export type ExactWebpackProfileEvent = ExactProfileEvent<'webpack-plugin', 'transform'>;

type FilterPattern = string | RegExp | readonly (string | RegExp)[];

/** Defines the webpack resolver like type contract. */
export type WebpackResolverLike = {
	hooks?: {
		resolve?: {
			tapAsync?(
				name: string,
				handler: (
					request: WebpackResolveRequest,
					context: unknown,
					callback: WebpackResolveCallback
				) => void
			): void;
		};
	};
	ensureHook?(name: string): unknown;
	getHook?(name: string): {
		tapAsync?(
			name: string,
			handler: (
				request: WebpackResolveRequest,
				context: unknown,
				callback: WebpackResolveCallback
			) => void
		): void;
	};
	doResolve?(
		hook: unknown,
		request: WebpackResolveRequest,
		message: string,
		context: unknown,
		callback: WebpackResolveCallback
	): void;
};

/** Defines the webpack compiler like type contract. */
export type WebpackCompilerLike = {
	options: {
		watch?: boolean;
		resolve?: {
			conditionNames?: string[];
			alias?: Record<string, string>;
		};
		module?: {
			rules?: unknown[];
		};
	};
	watchMode?: boolean;
	hooks?: {
		watchRun?: {
			tap?(
				name: string,
				handler: (
					compiler: WebpackCompilerLike & {
						modifiedFiles?: Iterable<string>;
						removedFiles?: Iterable<string>;
					}
				) => void
			): void;
		};
		normalModuleFactory?: {
			tap?(
				name: string,
				handler: (factory: {
					hooks?: {
						resolver?: {
							tap?(
								name: string,
								resolver: (resolver: WebpackResolverLike) => WebpackResolverLike
							): void;
						};
					};
				}) => void
			): void;
		};
		watchClose?: { tap?(name: string, handler: () => void): void };
		shutdown?: { tap?(name: string, handler: () => void): void };
		thisCompilation?: {
			tap?(
				name: string,
				handler: (compilation: {
					hooks?: {
						processAssets?: {
							tap?(options: { name: string }, handler: () => void): void;
						};
					};
					emitAsset?(filename: string, source: { source(): string; size(): number }): void;
				}) => void
			): void;
		};
	};
	getInfrastructureLogger?(name: string): { warn(message: string): void };
};

/** Defines the webpack resolve request type contract. */
export type WebpackResolveRequest = {
	request?: string;
	path?: string;
};

/** Defines the webpack resolve callback type contract. */
export type WebpackResolveCallback = (error?: Error | null, result?: unknown) => void;

/** Defines the exact webpack plugin class contract. */
export class ExactWebpackPlugin {
	readonly options: ExactWebpackPluginOptions;

	constructor(options: ExactWebpackPluginOptions = {}) {
		this.options = options;
	}

	/** Applies an apply to the owned runtime state for this exact webpack plugin instance. */
	apply(compiler: WebpackCompilerLike): void {
		let diagnosticsEnabled =
			this.options.diagnostics ?? Boolean(compiler.watchMode || compiler.options.watch);
		const owned = createWebpackCompilerSession(diagnosticsEnabled, this.options.onProfile);
		let compilerSession = owned.session;
		const configureDiagnostics = (enabled: boolean): void => {
			if (enabled === diagnosticsEnabled) return;
			diagnosticsEnabled = enabled;
			compilerSession = replaceWebpackCompilerSession(owned.id, enabled, this.options.onProfile);
		};
		const reporter = createExactDiagnosticReporter();
		const warn = (message: string): void =>
			compiler.getInfrastructureLogger?.('ExactWebpackPlugin').warn(message);
		addWebpackConditions(
			compiler,
			exactExportConditions(webpackTransformTarget(this.options), this.options)
		);
		addWebpackEnhancementAliases(compiler);
		const reactCompatibility = resolveReactCompatibility(this.options.reactCompatibility);
		if (reactCompatibility) addWebpackReactAliases(compiler, reactCompatibility);
		compiler.options.module ??= {};
		compiler.options.module.rules ??= [];
		const development = Boolean(compiler.watchMode || compiler.options.watch);
		const buildOptions = {
			...this.options,
			debug: resolveWebpackDebug(this.options.debug, development)
		};
		if (
			!development &&
			(buildOptions.debug.catalog === true || buildOptions.debug.runtime === true) &&
			!buildOptions.debug.buildKey
		)
			throw new Error(
				'eXact production DevTools output requires one explicit immutable debug.buildKey'
			);
		compiler.options.module.rules.push(createExactWebpackRule(buildOptions, owned.id));
		if (buildOptions.target === 'server') {
			compiler.hooks?.thisCompilation?.tap?.('ExactWebpackPlugin', (compilation) => {
				compilation.hooks?.processAssets?.tap?.({ name: 'ExactWebpackPlugin' }, () => {
					const catalog = webpackInspectionCatalog(owned.id, {
						applicationRoot: buildOptions.applicationRoot,
						...buildOptions.debug
					});
					if (!catalog || !compilation.emitAsset) return;
					const contents = `${JSON.stringify(catalog, null, 2)}\n`;
					compilation.emitAsset(`.exact-inspection/${catalog.buildKey}.json`, {
						source: () => contents,
						size: () => Buffer.byteLength(contents)
					});
				});
			});
		}
		compiler.hooks?.watchRun?.tap?.('ExactWebpackPlugin', (current) => {
			clearWebpackInspectionModules(owned.id);
			if (this.options.diagnostics === undefined) configureDiagnostics(true);
			const modified = [...(current.modifiedFiles ?? [])];
			const removed = new Set(current.removedFiles ?? []);
			for (const file of modified)
				reporter(compilerSession.invalidate(file, removed.has(file)), warn);
			for (const file of removed)
				if (!modified.includes(file)) reporter(compilerSession.invalidate(file, true), warn);
		});
		compiler.hooks?.normalModuleFactory?.tap?.('ExactWebpackPlugin', (factory) => {
			factory.hooks?.resolver?.tap?.('ExactWebpackPlugin', (resolver) =>
				applyExactWebpackResolver(resolver, this.options)
			);
		});
		const dispose = (): void => disposeWebpackCompilerSession(owned.id);
		compiler.hooks?.watchClose?.tap?.('ExactWebpackPlugin', dispose);
		compiler.hooks?.shutdown?.tap?.('ExactWebpackPlugin', dispose);
	}
}

/** Creates the webpack pre-loader rule for eXact JSX transforms. */
export function createExactWebpackRule(
	options: ExactWebpackPluginOptions = {},
	sessionId?: string
): Record<string, unknown> {
	return {
		test: /\.[cm]?[jt]sx?$/,
		enforce: 'pre',
		use: [
			{
				loader: '@exactjs/webpack-plugin/loader',
				options: { ...options, ...(sessionId ? { __exactSessionId: sessionId } : {}) }
			}
		]
	};
}

/** Transforms one webpack-loaded source file when it matches eXact plugin filters. */
export function transformExactWebpackSource(
	source: string,
	filename: string,
	options: ExactWebpackPluginOptions = {},
	session?: ExactCompilerSession
): { code: string; map: unknown } | null {
	if (!shouldTransformWebpackModule(filename, source, options)) return null;
	const reactCompatibility = resolveReactCompatibility(options.reactCompatibility);
	const compatibilityEngine = reactCompatibility
		? webpackCompatibilityEngine(options, session, reactCompatibility.target)
		: undefined;
	const ownership = jsxSourceOwnership(filename, source, reactCompatibility);
	const output = transformExactAdapterModule({
		source,
		filename,
		jsxOwnership: ownership,
		usesReactRuntimeImports: usesReactRuntimeImports(source, filename),
		transformReact: true,
		shouldCompile: true,
		invalidateCompatibility: () => compatibilityEngine?.invalidate(filename),
		...(reactCompatibility
			? {
					react: () =>
						transformReactJsx(source, {
							filename,
							target: reactCompatibility.target,
							sourceMap: options.sourceMap ?? true
						})
				}
			: {}),
		compiler: {
			options: {
				session,
				target: webpackTransformTarget(options),
				serverComponents: options.serverComponents,
				sourceMap: options.sourceMap ?? true,
				assetRules: options.assetRules,
				preserveClientAssetImports: true,
				jsxInterop: compatibilityEngine?.jsxInterop,
				emitInspection: options.target === 'server' && webpackDebugEnabled(options.debug?.catalog),
				instrumentInspection: webpackDebugEnabled(options.debug?.runtime)
			},
			finish: (result) => {
				const enhanced = prependExactEnhancementRegistrations(
					result.code,
					result.rendererEnhancements
				);
				const code =
					options.target !== 'server' && webpackDebugEnabled(options.debug?.runtime)
						? appendWebpackDevtoolsBootstrap(enhanced, options.debug)
						: enhanced;
				return {
					code,
					map: options.sourceMap === false ? null : createLineSourceMap(filename, source, code)
				};
			},
			inspection: (result) =>
				result.inspectionCatalog
					? {
							inspection: result.inspectionCatalog,
							redactions: result.inspectionRedactions,
							debug: options.debug
						}
					: undefined
		},
		profile: options.onProfile
			? { subsystem: 'webpack-plugin' as const, sink: options.onProfile }
			: undefined
	});
	if (output?.inspection)
		recordWebpackInspectionModule(options.__exactSessionId, filename, source, output.inspection);
	return output ? { code: output.code, map: output.map } : null;
}

/** Prepares the application registry before invoking the synchronous webpack transform. */
export async function transformExactWebpackSourceAsync(
	source: string,
	filename: string,
	options: ExactWebpackPluginOptions = {},
	session?: ExactCompilerSession
): Promise<{ code: string; map: unknown } | null> {
	const registry = await prepareExactPluginRegistry({
		applicationRoot: options.applicationRoot ?? path.dirname(filename),
		configPath: options.configPath,
		hostMode: 'build'
	});
	return transformExactWebpackSource(
		source,
		filename,
		{
			...options,
			debug: options.debug ?? registry.config?.debug
		},
		session
	);
}

/** Performs the compiler session for webpack loader domain operation. */
export function compilerSessionForWebpackLoader(
	sessionId: string | undefined
): ExactCompilerSession | undefined {
	return webpackCompilerSession(sessionId);
}
