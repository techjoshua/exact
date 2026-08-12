import {
	createCompilerSession,
	exactExportConditions,
	resolveNativeCompilerExecutable,
	type ExactCompilerSession
} from '@exactjs/compiler';
import { loadExactConfig } from '@exactjs/config/node';
import type { ExactPackageEnhancementImport } from '@exactjs/config';
import {
	createExactDiagnosticReporter,
	exactEnhancementFacadeImports
} from '@exactjs/compiler/adapter-support';
import { IntlBuildCoordinator } from '@exactjs/intl-build';
import { prepareExactPluginRegistry } from '@exactjs/plugin-host/node';
import {
	resolveReactCompatibility,
	validateInstalledReactReconciler
} from '@exactjs/react-compat/plugin';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import {
	createBunInspectionCatalog,
	resolveBunDebug,
	type ExactBunInspectionModule
} from './devtools.js';
import { ExactBunComponentAuthorization } from './component-authorization.js';
import { mergeConditions, resolveExactBunRequest, targetFor } from './selection.js';
import { transformExactBunSource as transformExactBunSourceImpl } from './transform.js';
import { ExactBunEnhancementFacadeCatalog } from './enhancement-catalog.js';
import {
	createExactLanguageValidationSession,
	type ExactLanguageValidationSession
} from '@exactjs/language-extension-host';
import { ExactBunMicrofrontendIntegration } from './microfrontends.js';
import {
	bunLoadFilter,
	bunLoader,
	bunSourceWithMap,
	normalizeConditions,
	readBunLoadSource
} from './source-loading.js';
export { mergeConditions, resolveExactBunRequest } from './selection.js';
import type { BunPluginLike, ExactBunPluginOptions } from './types.js';
export type * from './types.js';

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
			const remote = options.__exactRemoteBuild?.adapter;
			const remoteIntegration = remote ? new ExactBunMicrofrontendIntegration(remote) : undefined;
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
				remoteIntegration?.begin();
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
					const microfrontends = prepared.build.get('@exactjs/microfrontends') as
						| { exposes?: readonly unknown[] }
						| undefined;
					if (!remote && microfrontends?.exposes?.length)
						throw new Error(
							'Bun builds with eXact remote exposures must use exactBuild() so entrypoints can be prepared before Bun.build()'
						);
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
					remoteIntegration?.finish(build, result);
					componentAuthorization?.reject();
					return;
				}
				remoteIntegration?.finish(build, result);
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
			remoteIntegration?.install(build);
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
			if (options.target === 'server')
				build.onResolve({ filter: /^@exactjs\/(?:dom|hydrate|ssr)$/ }, (args) => ({
					path: exactEnhancementFacadeImports[
						args.path as keyof typeof exactEnhancementFacadeImports
					]
				}));
			build.onResolve({ filter: /^exact:optional-enhancement\// }, async (args) => {
				return enhancementFacades.resolve(args.path, args.importer, {
					authorization: componentAuthorization,
					resolve: build.resolve,
					aliases: build.config?.alias,
					activationModule:
						options.target === 'server' ? undefined : '@exactjs/dom/framework/enhancements'
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
				remoteIntegration?.recordSource(args.path, source);
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
				remoteIntegration?.recordSource(args.path, result.code);
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
