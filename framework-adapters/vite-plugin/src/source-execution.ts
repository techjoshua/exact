import path from 'node:path';
import { existsSync } from 'node:fs';
import {
	withExactHostExecutableSelection,
	exactExplicitBuildSourceFiles,
	isExactBuildAssetRequest,
	shouldCompileExactBuildModule,
	shouldTransformExactBuildModulePath
} from '@exactjs/compiler/adapter-support';
import type { ExactPlugin, ExactPluginOptions, ExactViteDebugOptions } from './plugin-contracts.js';
import { exactModuleFilename, isExactViteCacheModule } from './module-selection.js';
import { exactViteApplicationRoot, type createExactViteRootOwners } from './root-owners.js';
import { transformExactViteModule, type ExactViteInspectionRecord } from './transform.js';
import { finalizeExactViteTransform } from './transform-result.js';
import type { ExactViteCompilerSession } from './compiler-session.js';
import type { ExactViteTestHelperTargets } from './test-host/helper-targets.js';
import type { ExactViteComponentAuthorization } from './component-authorization.js';
import type { ExactLanguageValidationSession } from '@exactjs/language-extension-host';
import type { ExactViteSourcePreparation } from './source-preparation.js';

/** Concrete Vite owners retained throughout serialized preparation and dependent compilation. */
type SourceExecution = ReturnType<typeof createExactViteRootOwners> & {
	options: ExactPluginOptions;
	compiler: ExactViteCompilerSession;
	preparation: ExactViteSourcePreparation;
	testModuleTargets: ExactViteTestHelperTargets;
	languageValidation?: ExactLanguageValidationSession;
	componentAuthorization: ExactViteComponentAuthorization;
	inspectionModules: Map<string, ExactViteInspectionRecord>;
	viteCommand: 'build' | 'serve';
	viteCacheDir?: string;
	configuredDebug?: ExactViteDebugOptions;
	watchSourceConfiguration?: (files: readonly string[]) => void;
	ensureServerAuthorization(target: 'client' | 'server'): void;
};

/** Runs actual Vite resolution, final preparation, and compilation as one session operation. */
export function executeExactViteSource(
	this: ThisParameterType<ExactPlugin['transform']>,
	state: SourceExecution,
	code: string,
	id: string,
	hookOptions?: { ssr?: boolean }
) {
	const {
		options,
		compiler,
		preparation,
		testModuleTargets,
		languageValidation,
		componentAuthorization,
		inspectionModules,
		viteCommand,
		viteCacheDir,
		configuredDebug,
		watchSourceConfiguration,
		ensureServerAuthorization,
		configuration,
		reactCompatibility,
		compatibilityEngine,
		intl,
		microfrontends
	} = state;

	if (isExactBuildAssetRequest(id) || isExactViteCacheModule(id, viteCacheDir)) return null;
	const filename = exactModuleFilename(id);
	const applicationRoot = exactViteApplicationRoot(configuration, options);
	compiler.current.setAnalysisPolicy(configuration.loaded?.config?.analysis);
	const selectTarget = () =>
		testModuleTargets.transform(code, id, hookOptions?.ssr, {
			root: applicationRoot,
			session: compiler.current,
			packageEnhancements: configuration.loaded?.packageEnhancements
		});
	const perform = (
		requestTarget: 'client' | 'server',
		preparedSource?: ReturnType<ExactViteSourcePreparation['prepare']>
	) => {
		ensureServerAuthorization(requestTarget);
		const configurationFiles = configuration.observeSource(filename);
		watchSourceConfiguration?.(configurationFiles);
		if (viteCommand === 'build')
			for (const file of configurationFiles) if (existsSync(file)) this.addWatchFile?.(file);
		// Rollup resolves a module's imports after this hook. Record every remote-scoped source here,
		// including precompiled package JavaScript that the compiler transform intentionally skips.
		microfrontends.recordModule(code, id);
		const transformed = transformExactViteModule({
			code,
			preparedSource,
			id,
			options,
			requestTarget,
			applicationRoot,
			compilerSession: compiler.current,
			packageEnhancements: configuration.loaded?.packageEnhancements ?? [],
			reactCompatibility,
			compatibilityEngine,
			configuredDebug,
			languageValidation: Boolean(languageValidation),
			viteCommand,
			componentAuthorization,
			inspectionModules,
			intl,
			recordMicrofrontendModule: (source, moduleId) =>
				microfrontends.recordModule(source, moduleId),
			warn: (message) => this.warn?.(message)
		});
		if (transformed)
			compiler.observeProjectFiles(filename, (files) =>
				files.forEach((file) => this.addWatchFile?.(file))
			);
		return finalizeExactViteTransform(transformed, languageValidation);
	};
	if (!this.resolve || !shouldTransformExactBuildModulePath(filename, options))
		return perform(selectTarget());
	const hostResolve = this.resolve.bind(this);
	return withExactHostExecutableSelection(
		compiler.current,
		() => ({
			filename,
			source: code,
			target: selectTarget(),
			sourceRoot: applicationRoot,
			additionalSourceFiles: exactExplicitBuildSourceFiles(options),
			selectSource: shouldCompileExactBuildModule(filename, code, options),
			root: applicationRoot,
			configFile: options.typescriptConfig
				? path.resolve(applicationRoot, options.typescriptConfig)
				: undefined,
			packageEnhancements: configuration.loaded?.packageEnhancements,
			prepare: (source, filename, target) => {
				const prepared = preparation.prepare(
					{
						code: source,
						id: filename,
						options,
						reactCompatibility,
						intl,
						warn: (message) => this.warn?.(message)
					},
					target
				);
				return {
					source: prepared.analyzedCode,
					prepared,
					privateSource:
						prepared.ownership !== 'react' && shouldTransformExactBuildModulePath(filename, options)
				};
			},
			resolve: async (specifier, importer, kind) => {
				// This host hook has no proven require-condition resolver capability.
				if (kind === 'require') return undefined;
				const result = await hostResolve(specifier, importer, { skipSelf: false });
				return result ? { id: result.id, external: Boolean(result.external) } : undefined;
			}
		}),
		perform
	);
}
