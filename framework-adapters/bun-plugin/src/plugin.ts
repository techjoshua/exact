import {
	createCompilerSession,
	exactExportConditions,
	resolveNativeCompilerExecutable,
	type ExactAssetRule,
	type ExactCompilerSession,
	type TransformTarget
} from '@exactjs/compiler';
import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';
import { loadExactConfig } from '@exactjs/config/node';
import type { ExactPackageEnhancementImport } from '@exactjs/config';
import {
	createExactDiagnosticReporter,
	exactEnhancementFacadeImports
} from '@exactjs/compiler/adapter-support';
import { type ExactProfileEvent, type ExactProfileSink } from '@exactjs/instrumentation';
import { IntlBuildCoordinator, type IntlBuildConfiguration } from '@exactjs/intl-build';
import { prepareExactPluginRegistry } from '@exactjs/plugin-host/node';
import {
	resolveReactCompatibility,
	validateInstalledReactReconciler,
	type ReactCompatibilityOptions
} from '@exactjs/react-compat/plugin';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import {
	createBunInspectionCatalog,
	resolveBunDebug,
	type ExactBunInspectionModule
} from './devtools.js';
import {
	ExactBunComponentAuthorization,
	type ExactBunResolver
} from './component-authorization.js';
import { mergeConditions, resolveExactBunRequest, targetFor } from './selection.js';
import { transformExactBunSource as transformExactBunSourceImpl } from './transform.js';
import { ExactBunEnhancementFacadeCatalog } from './enhancement-catalog.js';
import {
	createExactLanguageValidationSession,
	type ExactLanguageValidationSession
} from '@exactjs/language-extension-host';
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
	/** @internal Collects the language projection for the shared validation session. */
	__exactLanguageValidation?: boolean;
	/** @internal Package-wide bindings loaded once by the owning build generation. */
	__exactPackageEnhancements?: readonly ExactPackageEnhancementImport[];
	/** Enables shared intl analysis, linking, catalogs, and generated descriptor modules. */
	internationalization?: false | Readonly<IntlBuildConfiguration>;
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

/** Defines the bun build like type contract. */
export type BunBuildLike = {
	config?: {
		alias?: Readonly<Record<string, string>>;
		conditions?: string | string[];
		watch?: boolean;
		hot?: boolean;
		outdir?: string;
	};
	resolve?: ExactBunResolver;
	onResolve(
		options: { filter: RegExp },
		handler: (
			args: BunResolveArgs
		) => BunResolveResult | undefined | Promise<BunResolveResult | undefined>
	): void;
	onLoad(
		options: { filter: RegExp; namespace?: string },
		handler: (args: BunLoadArgs) => BunLoadResult | undefined | Promise<BunLoadResult | undefined>
	): void;
	onStart?(handler: () => void | Promise<void>): void;
	onEnd?(
		handler: (
			result?: Readonly<{ success?: boolean; logs?: readonly unknown[] }>
		) => void | Promise<void>
	): void;
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
	namespace?: string;
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
	const intl = new IntlBuildCoordinator({
		applicationRoot: options.applicationRoot,
		configuration: options.internationalization || undefined,
		target: options.target === 'server' ? 'server' : 'client'
	});
	let componentAuthorization: ExactBunComponentAuthorization | undefined;
	let languageValidation: ExactLanguageValidationSession | undefined;
	return {
		name: 'exact',
		setup(build) {
			const enhancementFacades = new ExactBunEnhancementFacadeCatalog();
			if (options.target === 'server' && (build.config?.hot || process.argv.includes('--hot')))
				throw new Error(
					'[server-hmr-unsupported] Bun server --hot cannot preserve the last authorized component graph; use --watch instead'
				);
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
			let packageEnhancements: readonly ExactPackageEnhancementImport[] = [];
			build.config ??= {};
			build.config.conditions = mergeConditions(
				normalizeConditions(build.config.conditions),
				exactExportConditions(targetFor(options), options)
			);
			if (options.target === 'server')
				componentAuthorization = new ExactBunComponentAuthorization({
					applicationRoot: options.applicationRoot,
					buildKey: options.debug?.buildKey ?? (automaticDevelopment ? 'development' : undefined)
				});
			build.onStart?.(async () => {
				inspectionModules.clear();
				enhancementFacades.clear();
				await intl.beginBuild();
				const loadedConfig = await loadExactConfig({
					applicationRoot: path.resolve(options.applicationRoot ?? process.cwd()),
					configPath: options.configPath
				});
				packageEnhancements = loadedConfig.packageEnhancements;
				await languageValidation?.dispose();
				languageValidation = createExactLanguageValidationSession({
					workspaceRoot: path.resolve(options.applicationRoot ?? process.cwd()),
					config: loadedConfig.config?.languageExtensions
				});
				componentAuthorization?.startLoaded(loadedConfig);
				if (!registryPrepared) {
					const prepared = await prepareExactPluginRegistry({
						applicationRoot: options.applicationRoot,
						loadedConfig,
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
			build.onEnd?.(async (result) => {
				if (result?.success === false) {
					componentAuthorization?.reject();
					return;
				}
				intl.validateCatalogs();
				const debug = resolveBunDebug(configuredDebug, automaticDevelopment);
				if (options.target !== 'server') return;
				const outputRoot = path.resolve(
					options.applicationRoot ?? process.cwd(),
					build.config?.outdir ?? 'dist'
				);
				const committed = await componentAuthorization?.commit();
				if (debug.catalog === true) {
					const catalog = createBunInspectionCatalog(
						options,
						debug,
						inspectionModules,
						committed?.audit
					);
					if (catalog) {
						const filename = path.join(outputRoot, '.exact-inspection', `${catalog.buildKey}.json`);
						await mkdir(path.dirname(filename), { recursive: true });
						await writeFile(filename, `${JSON.stringify(catalog, null, 2)}\n`);
					}
				}
				if (committed) {
					const exactRoot = path.join(outputRoot, '.exact');
					await mkdir(exactRoot, { recursive: true });
					await Promise.all([
						writeFile(
							path.join(exactRoot, 'component-library-authorization.json'),
							`${JSON.stringify(committed.manifest, null, 2)}\n`
						),
						writeFile(
							path.join(exactRoot, 'component-library-audit.json'),
							`${JSON.stringify(committed.audit, null, 2)}\n`
						)
					]);
				}
			});
			build.onResolve({ filter: /\.exact$/ }, (args) => {
				const resolved = resolveExactBunRequest(args.path, args.importer, options);
				return resolved ? { path: resolved } : undefined;
			});
			build.onResolve({ filter: /^virtual:exact-intl\/descriptor\// }, (args) => ({
				path: args.path,
				namespace: 'exact-intl'
			}));
			build.onLoad({ filter: /.*/, namespace: 'exact-intl' }, (args) => {
				const module = intl.loadRequest(args.path);
				if (!module) throw new Error(`Unknown generated intl descriptor module ${args.path}`);
				return { contents: module.code, loader: 'js' };
			});
			build.onResolve({ filter: /^@exactjs\/(?:dom|hydrate|ssr)$/ }, (args) => ({
				path: exactEnhancementFacadeImports[args.path as keyof typeof exactEnhancementFacadeImports]
			}));
			build.onResolve({ filter: /^exact:optional-enhancement\// }, async (args) => {
				return enhancementFacades.resolve(args.path, args.importer, {
					authorization: componentAuthorization,
					resolve: build.resolve,
					aliases: build.config?.alias
				});
			});
			build.onLoad({ filter: /.*/, namespace: 'exact-enhancement-facade' }, (args) => ({
				contents: enhancementFacades.load(args.path),
				loader: 'js'
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
			build.onResolve({ filter: /^(?:@[^/]+\/[^/]+|[^./][^:]*)/ }, async (args) =>
				componentAuthorization?.authorize(
					args.path,
					args.importer ?? '',
					build.resolve,
					build.config?.alias
				)
			);
			build.onLoad({ filter: /.*/, namespace: 'exact-omitted-enhancement' }, () => ({
				contents: 'export {};\n',
				loader: 'js'
			}));
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
						__exactPackageEnhancements: packageEnhancements,
						__exactLanguageValidation: Boolean(languageValidation),
						debug: resolveBunDebug(configuredDebug, automaticDevelopment)
					},
					compilerSession,
					intl,
					(message) => console.warn(message)
				);
				if (!result) return undefined;
				if (result.languageProjection)
					await languageValidation?.validate([result.languageProjection]);
				if (result.componentBuild)
					componentAuthorization?.record(args.path, source, result.componentBuild);
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
	if (options.internationalization) return /\.[cm]?[jt]sx?$/i;
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
	session?: ExactCompilerSession,
	intl?: IntlBuildCoordinator,
	warn?: (message: string) => void
): ReturnType<typeof transformExactBunSourceImpl> {
	return transformExactBunSourceImpl(source, filename, options, session, intl, warn);
}
