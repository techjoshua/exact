import {
	createCompilerSession,
	createLineSourceMap,
	exactExportConditions,
	resolveNativeCompilerExecutable,
	type ExactAssetRule,
	type ExactCompilerSession,
	type ExactSourceInspection,
	type TransformTarget
} from '@exactjs/compiler';
import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';
import {
	createExactDiagnosticReporter,
	exactEnhancementFacadeImports,
	prependExactEnhancementRegistrations,
	transformExactAdapterModule
} from '@exactjs/compiler/adapter-support';
import { type ExactProfileEvent, type ExactProfileSink } from '@exactjs/instrumentation';
import { prepareExactPluginRegistry } from '@exactjs/plugin-host/node';
import {
	createReactCompatibilityBuildEngine,
	type ReactCompatibilityBuildEngine
} from '@exactjs/react-compat/build';
import {
	jsxSourceOwnership,
	resolveReactCompatibility,
	validateInstalledReactReconciler,
	type ReactCompatibilityOptions
} from '@exactjs/react-compat/plugin';
import { transformReactJsx, usesReactRuntimeImports } from '@exactjs/react-compat/transform';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import {
	appendBunDevtoolsBootstrap,
	bunDebugEnabled,
	createBunInspectionCatalog,
	resolveBunDebug,
	type ExactBunInspectionModule
} from './devtools.js';
import {
	mergeConditions,
	resolveExactBunRequest,
	shouldTransform,
	targetFor
} from './selection.js';
export { mergeConditions, resolveExactBunRequest } from './selection.js';

/** Configures exact bun plugin. */
export type ExactBunPluginOptions = {
	target?: TransformTarget;
	clientCondition?: string;
	serverCondition?: string;
	include?: FilterPattern;
	exclude?: FilterPattern;
	compileTestModules?: boolean;
	serverComponents?: boolean;
	sourceMap?: boolean;
	reactCompatibility?: boolean | ReactCompatibilityOptions;
	applicationRoot?: string;
	configPath?: string;
	assetRules?: readonly ExactAssetRule[];
	diagnostics?: boolean;
	onProfile?: ExactProfileSink;
	/** Independent server catalog and compact runtime controls. */
	debug?: ExactBunDebugOptions;
};

/** Higher-level Bun controls for server-cooperative DevTools output. */
export type ExactBunDebugOptions = {
	catalog?: boolean | 'auto';
	runtime?: boolean | 'auto';
	buildKey?: string;
	executionRoot?: string;
	rootComponentId?: string;
	producer?: Readonly<{ packageName?: string; version?: string }>;
	redactions?: Partial<ExactInspectionRedactionCatalog>;
};

/** Reports an observable exact bun profile event. */
export type ExactBunProfileEvent = ExactProfileEvent<'bun-plugin', 'transform'>;

type FilterPattern = string | RegExp | readonly (string | RegExp)[];
const bunCompatibilityEngines = new WeakMap<
	ExactCompilerSession,
	Map<string, ReactCompatibilityBuildEngine>
>();

/** Defines the bun build like type contract. */
export type BunBuildLike = {
	config?: {
		conditions?: string | string[];
		watch?: boolean;
		outdir?: string;
	};
	onResolve(
		options: { filter: RegExp },
		handler: (
			args: BunResolveArgs
		) => BunResolveResult | undefined | Promise<BunResolveResult | undefined>
	): void;
	onLoad(
		options: { filter: RegExp },
		handler: (args: BunLoadArgs) => BunLoadResult | undefined | Promise<BunLoadResult | undefined>
	): void;
	onStart?(handler: () => void | Promise<void>): void;
	onEnd?(handler: () => void | Promise<void>): void;
};

/** Defines the bun resolve args type contract. */
export type BunResolveArgs = {
	path: string;
	importer?: string;
};

/** Describes the result produced by bun resolve. */
export type BunResolveResult = {
	path: string;
	external?: boolean;
};

/** Defines the bun load args type contract. */
export type BunLoadArgs = {
	path: string;
	text?(): Promise<string>;
};

/** Describes the result produced by bun load. */
export type BunLoadResult = {
	contents: string;
	loader?: 'js' | 'jsx' | 'ts' | 'tsx';
};

/** Defines the bun plugin like type contract. */
export type BunPluginLike = {
	name: string;
	setup(build: BunBuildLike): void;
};

/** Creates the Bun plugin that transforms eXact JSX and resolves .exact facade imports. */
export function exact(options: ExactBunPluginOptions = {}): BunPluginLike {
	let diagnosticsEnabled = options.diagnostics ?? false;
	let compilerSession = createCompilerSession({
		nativeCompiler: { executable: resolveNativeCompilerExecutable() },
		onProfile: options.onProfile
	});
	const reportDiagnostics = createExactDiagnosticReporter();
	const inspectionModules = new Map<string, ExactBunInspectionModule>();
	return {
		name: 'exact',
		setup(build) {
			const automaticDevelopment = Boolean(
				build.config?.watch ||
					process.argv.includes('--watch') ||
					process.argv.includes('--hot') ||
					process.env.NODE_ENV === 'development'
			);
			const nextDiagnostics = options.diagnostics ?? automaticDevelopment;
			if (nextDiagnostics !== diagnosticsEnabled) {
				compilerSession.dispose();
				diagnosticsEnabled = nextDiagnostics;
				compilerSession = createCompilerSession({
					nativeCompiler: { executable: resolveNativeCompilerExecutable() },
					onProfile: options.onProfile
				});
			}
			const reactCompatibility = resolveReactCompatibility(options.reactCompatibility);
			let registryPrepared = false;
			let configuredDebug = options.debug;
			build.config ??= {};
			build.config.conditions = mergeConditions(
				normalizeConditions(build.config.conditions),
				exactExportConditions(targetFor(options), options)
			);
			build.onStart?.(async () => {
				inspectionModules.clear();
				if (!registryPrepared) {
					const prepared = await prepareExactPluginRegistry({
						applicationRoot: options.applicationRoot,
						configPath: options.configPath,
						hostMode: 'build'
					});
					registryPrepared = true;
					configuredDebug ??= prepared.config?.debug;
				}
				const debug = resolveBunDebug(configuredDebug, automaticDevelopment);
				if (
					!automaticDevelopment &&
					(debug.catalog === true || debug.runtime === true) &&
					!debug.buildKey
				)
					throw new Error(
						'eXact production DevTools output requires one explicit immutable debug.buildKey'
					);
			});
			build.onEnd?.(async () => {
				const debug = resolveBunDebug(configuredDebug, automaticDevelopment);
				if (options.target !== 'server' || debug.catalog !== true) return;
				const catalog = createBunInspectionCatalog(options, debug, inspectionModules);
				if (!catalog) return;
				const outputRoot = path.resolve(
					options.applicationRoot ?? process.cwd(),
					build.config?.outdir ?? 'dist'
				);
				const filename = path.join(outputRoot, '.exact-inspection', `${catalog.buildKey}.json`);
				await mkdir(path.dirname(filename), { recursive: true });
				await writeFile(filename, `${JSON.stringify(catalog, null, 2)}\n`);
			});
			build.onResolve({ filter: /\.exact$/ }, (args) => {
				const resolved = resolveExactBunRequest(args.path, args.importer, options);
				return resolved ? { path: resolved } : undefined;
			});
			build.onResolve({ filter: /^@exactjs\/(?:dom|hydrate|ssr)$/ }, (args) => ({
				path: exactEnhancementFacadeImports[args.path as keyof typeof exactEnhancementFacadeImports]
			}));
			if (reactCompatibility) {
				build.onResolve({ filter: /^react-reconciler$/ }, (args) => {
					validateInstalledReactReconciler(
						reactCompatibility.target,
						args.importer ? path.dirname(args.importer) : process.cwd()
					);
					return undefined;
				});
				build.onResolve(
					{
						filter:
							/^(?:react(?:\/(?:jsx-runtime|jsx-dev-runtime|compiler-runtime))?|react-dom(?:\/(?:client|server(?:\.(?:browser|node))?|static(?:\.(?:browser|node))?))?)$/
					},
					(args) => {
						const replacement = reactCompatibility.aliases[args.path];
						return replacement ? { path: replacement } : undefined;
					}
				);
			}
			// Bun does not expose Vite's changed-file HMR hook. Observe every loaded
			// TypeScript/JavaScript dependency so non-JSX type and export changes
			// invalidate their transitive expression consumers before compilation.
			build.onLoad({ filter: bunLoadFilter(options) }, async (args) => {
				const source = await readBunLoadSource(args);
				reportDiagnostics(compilerSession.invalidate(args.path), console.warn);
				const result = transformExactBunSource(
					source,
					args.path,
					{
						...options,
						debug: resolveBunDebug(configuredDebug, automaticDevelopment)
					},
					compilerSession
				);
				if (!result) return undefined;
				if (result.inspection)
					inspectionModules.set(path.resolve(args.path), {
						...result.inspection,
						source
					});
				return {
					contents: bunSourceWithMap(result.code, result.map),
					loader: bunLoader(args.path)
				};
			});
		}
	};
}

function bunLoadFilter(options: ExactBunPluginOptions): RegExp {
	if (!options.include && !options.exclude && options.compileTestModules !== true) {
		return /^(?!.*[\\/](?:node_modules|dist)[\\/])(?!.*\.(?:test|spec|jest)\.[cm]?[jt]sx?$).*\.[cm]?[jt]sx?$/i;
	}
	return /\.[cm]?[jt]sx?$/;
}

function normalizeConditions(conditions: string | readonly string[] | undefined): string[] {
	if (!conditions) return [];
	return typeof conditions === 'string' ? [conditions] : [...conditions];
}

function bunSourceWithMap(code: string, map: unknown): string {
	if (!map) return code;
	const encoded = Buffer.from(typeof map === 'string' ? map : JSON.stringify(map)).toString(
		'base64'
	);
	return `${code}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${encoded}`;
}

function bunLoader(filename: string): NonNullable<BunLoadResult['loader']> {
	const extension = path.extname(filename.split('?', 1)[0] ?? '').toLowerCase();
	if (extension === '.tsx') return 'tsx';
	if (extension === '.ts' || extension === '.mts' || extension === '.cts') return 'ts';
	if (extension === '.jsx') return 'jsx';
	return 'js';
}

async function readBunLoadSource(args: BunLoadArgs): Promise<string> {
	if (args.text) return args.text();
	const runtime = globalThis as typeof globalThis & {
		Bun?: {
			file(path: string): { text(): Promise<string> };
		};
	};
	if (!runtime.Bun)
		throw new Error('Bun runtime is required to load files through @exactjs/bun-plugin');
	return runtime.Bun.file(args.path).text();
}

/** Transforms one Bun-loaded source file when it matches eXact plugin filters. */
export function transformExactBunSource(
	source: string,
	filename: string,
	options: ExactBunPluginOptions = {},
	session?: ExactCompilerSession
): {
	code: string;
	map: unknown;
	inspection?: Readonly<{
		inspection: ExactSourceInspection;
		redactions?: ExactInspectionRedactionCatalog;
	}>;
} | null {
	if (!shouldTransform(filename, source, options)) return null;
	const reactCompatibility = resolveReactCompatibility(options.reactCompatibility);
	const compatibilityEngine = reactCompatibility
		? bunCompatibilityEngine(options, session, reactCompatibility.target)
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
				target: targetFor(options),
				serverComponents: options.serverComponents,
				sourceMap: options.sourceMap ?? true,
				assetRules: options.assetRules,
				preserveClientAssetImports: true,
				jsxInterop: compatibilityEngine?.jsxInterop,
				emitInspection: options.target === 'server' && bunDebugEnabled(options.debug?.catalog),
				instrumentInspection: bunDebugEnabled(options.debug?.runtime)
			},
			finish: (result) => {
				const enhanced = prependExactEnhancementRegistrations(
					result.code,
					result.rendererEnhancements
				);
				const code =
					options.target !== 'server' && bunDebugEnabled(options.debug?.runtime)
						? appendBunDevtoolsBootstrap(enhanced, options.debug)
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
							redactions: result.inspectionRedactions
						}
					: undefined
		},
		profile: options.onProfile
			? { subsystem: 'bun-plugin' as const, sink: options.onProfile }
			: undefined
	});
	return output ? { code: output.code, map: output.map, inspection: output.inspection } : null;
}

function bunCompatibilityEngine(
	options: ExactBunPluginOptions,
	session: ExactCompilerSession | undefined,
	target: 18 | 19
): ReactCompatibilityBuildEngine {
	const configured =
		typeof options.reactCompatibility === 'object'
			? options.reactCompatibility
			: { target, cwd: options.applicationRoot ?? process.cwd() };
	if (!session) return createReactCompatibilityBuildEngine(configured);
	const key = JSON.stringify([
		target,
		configured.cwd ?? '',
		configured.source instanceof RegExp
			? [configured.source.source, configured.source.flags]
			: (configured.source ?? '')
	]);
	let engines = bunCompatibilityEngines.get(session);
	if (!engines) {
		engines = new Map();
		bunCompatibilityEngines.set(session, engines);
	}
	let engine = engines.get(key);
	if (!engine) {
		engine = createReactCompatibilityBuildEngine(configured);
		engines.set(key, engine);
	}
	return engine;
}
