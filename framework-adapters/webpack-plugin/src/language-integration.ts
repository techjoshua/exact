import { createExactBuildConfiguration } from '@exactjs/compiler/adapter-support';
import { loadExactConfig } from '@exactjs/config/node';
import type { ExactPackageEnhancementImport } from '@exactjs/config';
import {
	createExactLanguageValidationSession,
	type ExactLanguageValidationSession
} from '@exactjs/language-extension-host';
import { prepareExactPluginRegistry } from '@exactjs/plugin-host/node';
import path from 'node:path';
import type { ExactWebpackPluginOptions } from './plugin.js';

/** Shared config and validation generation owned by one Webpack compiler lifecycle. */
export type ExactWebpackLanguageIntegration = Readonly<{
	validation(): Promise<ExactLanguageValidationSession>;
	packageEnhancements(): Promise<readonly ExactPackageEnhancementImport[]>;
	watchFiles(): Promise<readonly string[]>;
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
		watchFiles: async () => (await config()).watchFiles,
		invalidate(filename) {
			if (configuration.invalidate(filename)) {
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
