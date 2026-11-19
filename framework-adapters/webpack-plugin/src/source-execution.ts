import {
	withExactHostExecutableSelection,
	exactExplicitBuildSourceFiles,
	shouldTransformExactBuildModulePath,
	shouldCompileExactBuildModule,
	type ExactHostExecutableSelection
} from '@exactjs/compiler/adapter-support';
import type { ExactCompilerSession } from '@exactjs/compiler';
import type { IntlBuildCoordinator } from '@exactjs/intl-build';
import type { ExactLanguageProjectionV1 } from '@exactjs/language-extension-api';
import type { ExactPackageEnhancementImport } from '@exactjs/config';
import type { ExactWebpackPluginOptions } from './plugin.js';
import { transformExactWebpackModule, type ExactWebpackTransformResult } from './transform.js';
import { configuredExactWebpackTransformOptions } from './language-integration.js';
import { recordWebpackTransformResult } from './transform-recording.js';
import { shouldTransformWebpackModule } from './transform-selection.js';
import { ExactWebpackSourcePreparation } from './source-preparation.js';

/** Prepares the application registry before invoking the synchronous webpack transform. */
export async function transformExactWebpackSourceAsync(
	source: string,
	filename: string,
	options: ExactWebpackPluginOptions = {},
	session?: ExactCompilerSession,
	record?: (result: ExactWebpackTransformResult) => void,
	intl?: IntlBuildCoordinator,
	intlReady?: Promise<void>,
	validateLanguage?: (projection: ExactLanguageProjectionV1) => Promise<void>,
	packageEnhancements?: Promise<readonly ExactPackageEnhancementImport[]>,
	warn?: (message: string) => void,
	resolveMissingProvider?: (moduleSpecifier: string, importer: string) => string | undefined,
	resolveExecutable?: ExactHostExecutableSelection['resolve'],
	preparation = new ExactWebpackSourcePreparation()
): Promise<Pick<ExactWebpackTransformResult, 'code' | 'map' | 'jsxRuntime'> | null> {
	await intlReady;
	const configured = await configuredExactWebpackTransformOptions(
		options,
		filename,
		Boolean(validateLanguage)
	);
	if (packageEnhancements) configured.__exactPackageEnhancements = await packageEnhancements;
	if (resolveMissingProvider) configured.__exactEnhancementResolver = resolveMissingProvider;
	const perform = async (
		_target?: 'client' | 'server',
		preparedSource?: ReturnType<ExactWebpackSourcePreparation['prepare']>
	) => {
		const result = transformExactWebpackModule(
			source,
			filename,
			configured,
			session,
			intl,
			warn,
			preparedSource
		);
		if (!result) return null;
		if (result.languageProjection) await validateLanguage?.(result.languageProjection);
		if (record) record(result);
		else recordWebpackTransformResult(configured, filename, source, result);
		return {
			code: result.code,
			map: result.map,
			...(result.jsxRuntime ? { jsxRuntime: result.jsxRuntime } : {})
		};
	};
	if (!session || !resolveExecutable) return perform();
	return withExactHostExecutableSelection(
		session,
		() => ({
			filename,
			source,
			target: configured.target === 'server' ? 'server' : 'client',
			sourceRoot: configured.applicationRoot,
			additionalSourceFiles: exactExplicitBuildSourceFiles(configured),
			selectSource: shouldCompileExactBuildModule(filename, source, {
				...configured,
				compileTestModules: true
			}),
			packageEnhancements: configured.__exactPackageEnhancements,
			prepare: (source, filename, target) => {
				const prepared = preparation.prepare(
					source,
					filename,
					target,
					configured,
					intl,
					warn,
					shouldTransformWebpackModule(filename, source, configured)
				);
				return {
					source: prepared.analyzedSource,
					prepared,
					privateSource:
						prepared.ownership !== 'react' &&
						shouldTransformExactBuildModulePath(filename, configured)
				};
			},
			resolve: resolveExecutable
		}),
		perform
	);
}
