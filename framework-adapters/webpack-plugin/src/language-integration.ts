import { createExactBuildConfiguration } from '@exactjs/compiler/adapter-support';
import { loadExactConfig } from '@exactjs/config/node';
import type { ExactPackageEnhancementImport } from '@exactjs/config';
import {
	createExactLanguageValidationSession,
	type ExactLanguageValidationSession
} from '@exactjs/language-extension-host';
import { prepareExactPluginRegistry } from '@exactjs/plugin-host/node';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { ExactWebpackPluginOptions } from './plugin.js';

/** A configuration discovery path as observed by the configuration generation that uses it. */
export type ExactWebpackConfigurationDependency = Readonly<{ filename: string; missing: boolean }>;

/** Shared config and validation generation owned by one Webpack compiler lifecycle. */
export type ExactWebpackLanguageIntegration = Readonly<{
	validation(): Promise<ExactLanguageValidationSession>;
	packageEnhancements(): Promise<readonly ExactPackageEnhancementImport[]>;
	watchFiles(): Promise<readonly ExactWebpackConfigurationDependency[]>;
	invalidate(filename: string): void;
	dispose(): Promise<void>;
}>;

/** Shares package bindings within each watch generation and lazily starts validation providers. */
export function createExactWebpackLanguageIntegration(
	options: ExactWebpackPluginOptions
): ExactWebpackLanguageIntegration {
	const applicationRoot = path.resolve(options.applicationRoot ?? process.cwd());
	const configuration = createExactBuildConfiguration({
		applicationRoot,
		configPath: options.configPath
	});
	const config = configuration.read;
	let dependencies: Promise<readonly ExactWebpackConfigurationDependency[]> | undefined;
	const retired = new Set<Promise<void>>();
	const disposalErrors: unknown[] = [];
	let validation: Promise<ExactLanguageValidationSession> | undefined;
	return Object.freeze({
		validation: () =>
			(validation ??= config().then(async (loaded) => {
				const registry = await prepareExactPluginRegistry({
					applicationRoot,
					loadedConfig: loaded,
					hostMode: 'build'
				});
				return createExactLanguageValidationSession({
					workspaceRoot: registry.applicationRoot,
					config: loaded.config?.languageExtensions,
					packageEnhancements: loaded.packageEnhancements
				});
			})),
		packageEnhancements: async () => (await config()).packageEnhancements,
		watchFiles: () =>
			(dependencies ??= Promise.all([config(), configuration.watchFiles()]).then(
				([loaded, files]) => {
					// A file consumed by this generation remains an existing dependency even
					// if it disappears during compilation. Webpack must observe that removal.
					return files.map((filename) => ({
						filename,
						missing: !loaded.watchFiles.includes(filename) && !existsSync(filename)
					}));
				}
			)),
		invalidate(filename) {
			if (configuration.invalidate(filename)) {
				dependencies = undefined;
				const previous = validation;
				validation = undefined;
				if (previous) {
					const disposal = previous
						.then(
							(session) => session.dispose(),
							() => undefined
						)
						.catch((error: unknown) => {
							disposalErrors.push(error);
						})
						.finally(() => retired.delete(disposal));
					retired.add(disposal);
				}
			}
		},
		dispose: async () => {
			const session = await validation?.catch(() => undefined);
			try {
				await session?.dispose();
			} catch (error) {
				disposalErrors.push(error);
			}
			await Promise.all(retired);
			if (disposalErrors.length)
				throw new AggregateError(disposalErrors, 'Failed to dispose Webpack validation sessions');
		}
	});
}

/** Resolves the config-derived options required by a standalone asynchronous loader call. */
export async function configuredExactWebpackTransformOptions(
	options: ExactWebpackPluginOptions,
	filename: string,
	languageValidation: boolean
): Promise<ExactWebpackPluginOptions> {
	const applicationRoot = options.applicationRoot ?? path.dirname(filename);
	const [registry, loaded] = await Promise.all([
		prepareExactPluginRegistry({
			applicationRoot,
			configPath: options.configPath,
			hostMode: 'build'
		}),
		loadExactConfig({ applicationRoot, configPath: options.configPath })
	]);
	return {
		...options,
		debug: options.debug ?? registry.config?.debug,
		__exactLanguageValidation: languageValidation,
		__exactPackageEnhancements: loaded.packageEnhancements
	};
}
