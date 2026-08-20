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
	dispose(): Promise<void>;
}>;

/** Loads package bindings once and lazily starts executable validation providers. */
export function createExactWebpackLanguageIntegration(
	options: ExactWebpackPluginOptions
): ExactWebpackLanguageIntegration {
	const applicationRoot = path.resolve(options.applicationRoot ?? process.cwd());
	let loaded: ReturnType<typeof loadExactConfig> | undefined;
	const config = () =>
		(loaded ??= loadExactConfig({ applicationRoot, configPath: options.configPath }));
	let validation: Promise<ExactLanguageValidationSession> | undefined;
	return Object.freeze({
		validation: () =>
			(validation ??= Promise.all([
				prepareExactPluginRegistry({
					applicationRoot: options.applicationRoot,
					configPath: options.configPath,
					hostMode: 'build'
				}),
				config()
			]).then(([registry, config]) =>
				createExactLanguageValidationSession({
					workspaceRoot: registry.applicationRoot,
					config: registry.config?.languageExtensions,
					packageEnhancements: config.packageEnhancements
				})
			)),
		packageEnhancements: async () => (await config()).packageEnhancements,
		dispose: async () => {
			const session = await validation?.catch(() => undefined);
			await session?.dispose();
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
