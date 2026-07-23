import {
	exactExportConditions,
	resolveExactArtifactImport,
	transformSource,
	type ExactAssetRule,
	type ExactCompilerManifest,
	type ExactCompilerSession,
	type TransformTarget
} from '@exactjs/compiler';
import {
	createExactDiagnosticReporter,
	loadExactImportedManifests,
	matchesExactBuildFilter
} from '@exactjs/compiler/adapter-support';
import {
	profileTimestamp,
	type ExactProfileEvent,
	type ExactProfileSink
} from '@exactjs/instrumentation';
import type { ExactPreparedCompilerRegistry } from '@exactjs/plugin-api';
import { prepareExactPluginRegistry } from '@exactjs/plugin-host/node';
import {
	jsxSourceOwnership,
	resolveReactCompatibility,
	validateInstalledReactReconciler,
	type ReactCompatibilityOptions,
	type ResolvedReactCompatibility
} from '@exactjs/react-compat/plugin';
import { transformReactJsx, usesReactRuntimeImports } from '@exactjs/react-compat/transform';
import path from 'node:path';
import {
	createWebpackCompilerSession,
	disposeWebpackCompilerSession,
	replaceWebpackCompilerSession,
	webpackCompilerSession
} from './sessions.js';

/** Configures exact webpack plugin. */
export type ExactWebpackPluginOptions = {
	target?: TransformTarget;
	importedManifests?: readonly ExactCompilerManifest[];
	manifestFiles?: readonly string[];
	clientCondition?: string;
	serverCondition?: string;
	include?: FilterPattern;
	exclude?: FilterPattern;
	serverComponents?: boolean;
	sourceMap?: boolean;
	reactCompatibility?: boolean | ReactCompatibilityOptions;
	applicationRoot?: string;
	configPath?: string;
	pluginRegistry?: ExactPreparedCompilerRegistry;
	assetRules?: readonly ExactAssetRule[];
	diagnostics?: boolean;
	onProfile?: ExactProfileSink;
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
		addWebpackConditions(compiler, exactExportConditions(targetFor(this.options), this.options));
		const reactCompatibility = resolveReactCompatibility(this.options.reactCompatibility);
		if (reactCompatibility) addWebpackReactAliases(compiler, reactCompatibility);
		compiler.options.module ??= {};
		compiler.options.module.rules ??= [];
		compiler.options.module.rules.push(createExactWebpackRule(this.options, owned.id));
		compiler.hooks?.watchRun?.tap?.('ExactWebpackPlugin', (current) => {
			if (this.options.diagnostics === undefined) configureDiagnostics(true);
			const modified = [...(current.modifiedFiles ?? [])];
			const removed = new Set(current.removedFiles ?? []);
			if (modified.some((file) => /(?:^|[\\/])tsconfig(?:\.[^\\/]+)?\.json$/i.test(file))) {
				compilerSession.clear();
				return;
			}
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
	if (!shouldTransform(filename, source, options)) return null;
	const profileStarted = options.onProfile ? profileTimestamp() : undefined;
	try {
		const reactCompatibility = resolveReactCompatibility(options.reactCompatibility);
		const ownership = jsxSourceOwnership(filename, source, reactCompatibility);
		const reactOwned =
			ownership === 'react' ||
			(ownership === 'unknown' && usesReactRuntimeImports(source, filename));
		if (reactOwned) {
			if (!reactCompatibility) return null;
			return transformReactJsx(source, {
				filename,
				target: reactCompatibility.target,
				sourceMap: options.sourceMap ?? true
			});
		}
		const result = transformSource(source, {
			filename,
			session,
			target: targetFor(options),
			importedManifests: importedManifestsFor(options),
			serverComponents: options.serverComponents,
			sourceMap: options.sourceMap ?? true,
			assetRules: options.assetRules,
			preserveClientAssetImports: true,
			pluginRegistry: options.pluginRegistry
		});
		return {
			code: result.code,
			map: result.map
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`eXact JSX transform failed for ${filename}\n${message}`);
	} finally {
		if (profileStarted !== undefined) {
			options.onProfile?.(
				Object.freeze({
					subsystem: 'webpack-plugin',
					phase: 'transform',
					elapsedMs: profileTimestamp() - profileStarted,
					attributes: Object.freeze({ filename })
				})
			);
		}
	}
}

/** Prepares the application registry before invoking the synchronous webpack transform. */
export async function transformExactWebpackSourceAsync(
	source: string,
	filename: string,
	options: ExactWebpackPluginOptions = {},
	session?: ExactCompilerSession
): Promise<{ code: string; map: unknown } | null> {
	if (options.pluginRegistry)
		return transformExactWebpackSource(source, filename, options, session);
	const registry = await prepareExactPluginRegistry({
		applicationRoot: options.applicationRoot ?? path.dirname(filename),
		configPath: options.configPath,
		hostMode: 'compiler'
	});
	return transformExactWebpackSource(
		source,
		filename,
		{
			...options,
			pluginRegistry: registry.compiler
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

function importedManifestsFor(options: {
	importedManifests?: readonly ExactCompilerManifest[];
	manifestFiles?: readonly string[];
}): ExactCompilerManifest[] {
	return loadExactImportedManifests(options);
}

/** Resolves a webpack import request for a .exact facade to a target artifact. */
export function resolveExactWebpackRequest(
	request: string,
	importer: string | undefined,
	options: ExactWebpackPluginOptions = {}
): string | null {
	return resolveExactArtifactImport(request, importer, targetFor(options))?.id ?? null;
}

/** Installs .exact facade resolution into a webpack resolver. */
export function applyExactWebpackResolver(
	resolver: WebpackResolverLike,
	options: ExactWebpackPluginOptions = {}
): WebpackResolverLike {
	const resolveHook = resolver.getHook?.('resolve') ?? resolver.hooks?.resolve;
	const targetHook = resolver.ensureHook?.('resolved') ?? resolveHook;
	resolveHook?.tapAsync?.('ExactWebpackPlugin', (request, context, callback) => {
		if (!request.request) {
			callback();
			return;
		}
		const importer = request.path ? path.join(request.path, '__exact_importer.ts') : undefined;
		if (request.request === 'react-reconciler') {
			const reactCompatibility = resolveReactCompatibility(options.reactCompatibility);
			if (reactCompatibility) {
				try {
					validateInstalledReactReconciler(
						reactCompatibility.target,
						request.path ?? process.cwd()
					);
				} catch (error) {
					callback(error instanceof Error ? error : new Error(String(error)));
					return;
				}
			}
		}
		const resolved = resolveExactWebpackRequest(request.request, importer, options);
		if (!resolved) {
			callback();
			return;
		}
		const nextRequest = {
			...request,
			request: resolved
		};
		if (resolver.doResolve && targetHook) {
			resolver.doResolve(
				targetHook,
				nextRequest,
				'resolved eXact target artifact',
				context,
				callback
			);
			return;
		}
		callback(null, nextRequest);
	});
	return resolver;
}

/** Prepends eXact export conditions to webpack's conditionNames list. */
export function addWebpackConditions(
	compiler: WebpackCompilerLike,
	conditions: readonly string[]
): void {
	compiler.options.resolve ??= {};
	const current = compiler.options.resolve.conditionNames ?? [];
	compiler.options.resolve.conditionNames = [
		...conditions,
		...current.filter((condition) => !conditions.includes(condition))
	];
}

/** Performs the add webpack react aliases domain operation. */
export function addWebpackReactAliases(
	compiler: WebpackCompilerLike,
	resolved: ResolvedReactCompatibility
): void {
	compiler.options.resolve ??= {};
	const current = compiler.options.resolve.alias ?? {};
	compiler.options.resolve.alias = {
		...Object.fromEntries(
			Object.entries(resolved.aliases).map(([request, replacement]) => [`${request}$`, replacement])
		),
		...current
	};
}

function targetFor(options: ExactWebpackPluginOptions): 'client' | 'server' {
	return options.target === 'server' ? 'server' : 'client';
}

function shouldTransform(id: string, code: string, options: ExactWebpackPluginOptions): boolean {
	if (!/\.[cm]?[jt]sx?(?:$|\?)/.test(id)) return false;
	if (!options.include && /(?:^|[\\/])node_modules(?:[\\/]|$)/.test(id)) return false;
	if (options.include && !matchesExactBuildFilter(id, options.include)) return false;
	if (options.exclude && matchesExactBuildFilter(id, options.exclude)) return false;
	return (
		code.includes('<') ||
		/@exact\s+[A-Za-z_$][\w$-]*\.[A-Za-z_$][\w$-]*/.test(code) ||
		Object.values(options.pluginRegistry?.plugins ?? {}).some((plugin) => {
			const include = plugin.extension?.include;
			if (!include) return false;
			include.lastIndex = 0;
			return include.test(id);
		})
	);
}
