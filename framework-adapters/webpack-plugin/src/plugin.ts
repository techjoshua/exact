import {
	exactExportConditions,
	type ExactAssetRule,
	type ExactCompilerSession,
	type TransformTarget
} from '@exactjs/compiler';
import { createExactDiagnosticReporter } from '@exactjs/compiler/adapter-support';
import type { ExactComponentAuthorizationAudit } from '@exactjs/component-library-policy';
import { type ExactProfileEvent, type ExactProfileSink } from '@exactjs/instrumentation';
import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';
import { prepareExactPluginRegistry } from '@exactjs/plugin-host/node';
import {
	resolveReactCompatibility,
	type ReactCompatibilityOptions
} from '@exactjs/react-compat/plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	createWebpackCompilerSession,
	clearWebpackInspectionModules,
	authorizeWebpackResolvedComponent,
	commitWebpackAuthorizationGeneration,
	disposeWebpackCompilerSession,
	replaceWebpackCompilerSession,
	webpackCompilerSession,
	recordWebpackInspectionModule,
	recordWebpackComponentBuildFacts,
	resetWebpackAuthorizationGeneration,
	webpackInspectionCatalog
} from './sessions.js';
import { webpackTransformTarget } from './transform-selection.js';
import {
	addWebpackConditions,
	addWebpackEnhancementAliases,
	addWebpackReactAliases,
	applyExactWebpackResolver
} from './resolver.js';
import { resolveWebpackDebug } from './devtools.js';
import { transformExactWebpackModule, type ExactWebpackTransformResult } from './transform.js';
import {
	installExactWebpackLoaderBridge,
	removeExactWebpackLoaderBridge,
	type ExactWebpackLoaderBridgeCarrier
} from './loader-bridge.js';
import {
	createWebpackPublishedComponentResolver,
	type WebpackNormalResolver
} from './published-component-resolver.js';
import type {
	WebpackAfterResolveData,
	WebpackResolveCallback,
	WebpackResolveRequest
} from './resolution-contracts.js';
import { createExactWebpackRule } from './rule.js';
export { createExactWebpackRule } from './rule.js';
export type {
	WebpackAfterResolveData,
	WebpackResolveCallback,
	WebpackResolveRequest
} from './resolution-contracts.js';
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
					getResolver?(type: 'normal'): WebpackNormalResolver;
					hooks?: {
						afterResolve?: {
							tapPromise?(
								name: string,
								handler: (data: WebpackAfterResolveData | false | undefined) => Promise<void>
							): void;
						};
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
							tapPromise?(options: { name: string }, handler: () => Promise<void>): void;
						};
					};
					emitAsset?(filename: string, source: { source(): string; size(): number }): void;
				}) => void
			): void;
		};
	};
	getInfrastructureLogger?(name: string): { warn(message: string): void };
};

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
		const bridgeCarrier = compiler as WebpackCompilerLike & ExactWebpackLoaderBridgeCarrier;
		installExactWebpackLoaderBridge(bridgeCarrier, {
			get session() {
				return compilerSession;
			},
			record: (filename, source, result) =>
				recordWebpackTransformResult(
					{ ...buildOptions, __exactSessionId: owned.id },
					filename,
					source,
					result
				)
		});
		if (
			!development &&
			(buildOptions.debug.catalog === true || buildOptions.debug.runtime === true) &&
			!buildOptions.debug.buildKey
		)
			throw new Error(
				'eXact production DevTools output requires one explicit immutable debug.buildKey'
			);
		compiler.options.module.rules.push(createExactWebpackRule(buildOptions, owned.id));
		const authorizationOptions = {
			target: buildOptions.target,
			applicationRoot: buildOptions.applicationRoot,
			configPath: buildOptions.configPath,
			buildKey: buildOptions.debug.buildKey
		};
		resetWebpackAuthorizationGeneration(owned.id, authorizationOptions);
		if (buildOptions.target === 'server') {
			compiler.hooks?.thisCompilation?.tap?.('ExactWebpackPlugin', (compilation) => {
				const emitInspection = (componentAuthorization?: ExactComponentAuthorizationAudit) => {
					const catalog = webpackInspectionCatalog(owned.id, {
						applicationRoot: buildOptions.applicationRoot,
						...buildOptions.debug,
						componentAuthorization
					});
					if (!catalog || !compilation.emitAsset) return;
					const contents = `${JSON.stringify(catalog, null, 2)}\n`;
					compilation.emitAsset(`.exact-inspection/${catalog.buildKey}.json`, {
						source: () => contents,
						size: () => Buffer.byteLength(contents)
					});
				};
				const processAssets = async () => {
					const committed = await commitWebpackAuthorizationGeneration(
						owned.id,
						authorizationOptions
					);
					emitInspection(committed?.audit);
					if (!committed || !compilation.emitAsset) return;
					for (const [filename, value] of [
						['.exact/component-library-authorization.json', committed.manifest],
						['.exact/component-library-audit.json', committed.audit]
					] as const) {
						const contents = `${JSON.stringify(value, null, 2)}\n`;
						compilation.emitAsset(filename, {
							source: () => contents,
							size: () => Buffer.byteLength(contents)
						});
					}
				};
				if (compilation.hooks?.processAssets?.tapPromise)
					compilation.hooks.processAssets.tapPromise({ name: 'ExactWebpackPlugin' }, processAssets);
				else
					compilation.hooks?.processAssets?.tap?.({ name: 'ExactWebpackPlugin' }, emitInspection);
			});
		}
		compiler.hooks?.watchRun?.tap?.('ExactWebpackPlugin', (current) => {
			clearWebpackInspectionModules(owned.id);
			resetWebpackAuthorizationGeneration(owned.id, authorizationOptions);
			if (this.options.diagnostics === undefined) configureDiagnostics(true);
			const modified = [...(current.modifiedFiles ?? [])];
			const removed = new Set(current.removedFiles ?? []);
			for (const file of modified)
				reporter(compilerSession.invalidate(file, removed.has(file)), warn);
			for (const file of removed)
				if (!modified.includes(file)) reporter(compilerSession.invalidate(file, true), warn);
		});
		compiler.hooks?.normalModuleFactory?.tap?.('ExactWebpackPlugin', (factory) => {
			const resolvePublished = createWebpackPublishedComponentResolver(
				factory.getResolver?.('normal')
			);
			factory.hooks?.resolver?.tap?.('ExactWebpackPlugin', (resolver) =>
				applyExactWebpackResolver(resolver, this.options)
			);
			factory.hooks?.afterResolve?.tapPromise?.('ExactWebpackPlugin', async (data) => {
				const request = data && (data.createData?.rawRequest ?? data.request);
				const importer = data && data.contextInfo?.issuer;
				const resource = data && data.createData?.resource;
				if (request && importer && resource) {
					const authorization = await authorizeWebpackResolvedComponent(
						owned.id,
						authorizationOptions,
						request,
						importer,
						resource,
						resolvePublished
					);
					if (authorization === 'omitted' && data?.createData)
						data.createData.resource = fileURLToPath(
							new URL('./omitted-enhancement.js', import.meta.url)
						);
				}
			});
		});
		const dispose = (): void => {
			removeExactWebpackLoaderBridge(bridgeCarrier);
			disposeWebpackCompilerSession(owned.id);
		};
		compiler.hooks?.watchClose?.tap?.('ExactWebpackPlugin', dispose);
		compiler.hooks?.shutdown?.tap?.('ExactWebpackPlugin', dispose);
	}
}

/** Transforms one webpack-loaded source file when it matches eXact plugin filters. */
export function transformExactWebpackSource(
	source: string,
	filename: string,
	options: ExactWebpackPluginOptions = {},
	session?: ExactCompilerSession
): { code: string; map: unknown } | null {
	const result = transformExactWebpackModule(source, filename, options, session);
	if (!result) return null;
	recordWebpackTransformResult(options, filename, source, result);
	return { code: result.code, map: result.map };
}

/** Prepares the application registry before invoking the synchronous webpack transform. */
export async function transformExactWebpackSourceAsync(
	source: string,
	filename: string,
	options: ExactWebpackPluginOptions = {},
	session?: ExactCompilerSession,
	record?: (result: ExactWebpackTransformResult) => void
): Promise<{ code: string; map: unknown } | null> {
	const registry = await prepareExactPluginRegistry({
		applicationRoot: options.applicationRoot ?? path.dirname(filename),
		configPath: options.configPath,
		hostMode: 'build'
	});
	const configured = {
		...options,
		debug: options.debug ?? registry.config?.debug
	};
	const result = transformExactWebpackModule(source, filename, configured, session);
	if (!result) return null;
	if (record) record(result);
	else recordWebpackTransformResult(configured, filename, source, result);
	return { code: result.code, map: result.map };
}

function recordWebpackTransformResult(
	options: ExactWebpackPluginOptions,
	filename: string,
	source: string,
	result: ExactWebpackTransformResult
): void {
	if (result.componentBuild)
		recordWebpackComponentBuildFacts(
			options.__exactSessionId,
			filename,
			source,
			result.componentBuild
		);
	if (result.inspection)
		recordWebpackInspectionModule(options.__exactSessionId, filename, source, result.inspection);
}

/** Performs the compiler session for webpack loader domain operation. */
export function compilerSessionForWebpackLoader(
	sessionId: string | undefined
): ExactCompilerSession | undefined {
	return webpackCompilerSession(sessionId);
}
