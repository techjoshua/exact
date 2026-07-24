import {
	createCompilerSession,
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
	type ReactCompatibilityOptions
} from '@exactjs/react-compat/plugin';
import { transformReactJsx, usesReactRuntimeImports } from '@exactjs/react-compat/transform';
import path from 'node:path';

/** Configures exact bun plugin. */
export type ExactBunPluginOptions = {
	target?: TransformTarget;
	importedManifests?: readonly ExactCompilerManifest[];
	manifestFiles?: readonly string[];
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
	pluginRegistry?: ExactPreparedCompilerRegistry;
	assetRules?: readonly ExactAssetRule[];
	diagnostics?: boolean;
	onProfile?: ExactProfileSink;
};

/** Reports an observable exact bun profile event. */
export type ExactBunProfileEvent = ExactProfileEvent<'bun-plugin', 'transform'>;

type FilterPattern = string | RegExp | readonly (string | RegExp)[];

/** Defines the bun build like type contract. */
export type BunBuildLike = {
	config?: {
		conditions?: string | string[];
		watch?: boolean;
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
		languageService: diagnosticsEnabled,
		onProfile: options.onProfile
	});
	const reportDiagnostics = createExactDiagnosticReporter();
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
					languageService: nextDiagnostics,
					onProfile: options.onProfile
				});
			}
			const reactCompatibility = resolveReactCompatibility(options.reactCompatibility);
			let pluginRegistry = options.pluginRegistry;
			build.config ??= {};
			build.config.conditions = mergeConditions(
				normalizeConditions(build.config.conditions),
				exactExportConditions(targetFor(options), options)
			);
			build.onStart?.(async () => {
				if (!pluginRegistry) {
					pluginRegistry = (
						await prepareExactPluginRegistry({
							applicationRoot: options.applicationRoot,
							configPath: options.configPath,
							hostMode: 'compiler'
						})
					).compiler;
				}
			});
			build.onResolve({ filter: /\.exact$/ }, (args) => {
				const resolved = resolveExactArtifactImport(args.path, args.importer, targetFor(options));
				return resolved ? { path: resolved.id } : undefined;
			});
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
					{ ...options, pluginRegistry },
					compilerSession
				);
				if (!result) return undefined;
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
					subsystem: 'bun-plugin',
					phase: 'transform',
					elapsedMs: profileTimestamp() - profileStarted,
					attributes: Object.freeze({ filename })
				})
			);
		}
	}
}

function importedManifestsFor(options: {
	importedManifests?: readonly ExactCompilerManifest[];
	manifestFiles?: readonly string[];
}): ExactCompilerManifest[] {
	return loadExactImportedManifests(options);
}

/** Resolves a Bun import request for a .exact facade to a target artifact. */
export function resolveExactBunRequest(
	request: string,
	importer: string | undefined,
	options: ExactBunPluginOptions = {}
): string | null {
	return resolveExactArtifactImport(request, importer, targetFor(options))?.id ?? null;
}

/** Prepends eXact export conditions without duplicating existing conditions. */
export function mergeConditions(current: readonly string[], next: readonly string[]): string[] {
	return [...next, ...current.filter((condition) => !next.includes(condition))];
}

function targetFor(options: ExactBunPluginOptions): 'client' | 'server' {
	return options.target === 'server' ? 'server' : 'client';
}

function shouldTransform(id: string, code: string, options: ExactBunPluginOptions): boolean {
	if (!/\.[cm]?[jt]sx?(?:$|\?)/.test(id)) return false;
	if (!options.include && /(?:^|[\\/])node_modules(?:[\\/]|$)/.test(id)) return false;
	if (
		options.compileTestModules !== true &&
		/(?:^|[\\/])[^\\/]+\.(?:test|spec|jest)\.[cm]?[jt]sx?$/i.test(id)
	)
		return false;
	if (options.include && !matchesExactBuildFilter(id, options.include)) return false;
	if (options.exclude && matchesExactBuildFilter(id, options.exclude)) return false;
	return (
		(/\.[jt]sx(?:$|\?)/i.test(id) && code.includes('<')) ||
		/@exact\s+[A-Za-z_$][\w$-]*\.[A-Za-z_$][\w$-]*/.test(code) ||
		Object.values(options.pluginRegistry?.plugins ?? {}).some((plugin) => {
			const include = plugin.extension?.include;
			if (!include) return false;
			include.lastIndex = 0;
			return include.test(id);
		})
	);
}
