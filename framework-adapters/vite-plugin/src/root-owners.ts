import { IntlBuildCoordinator } from '@exactjs/intl-build';
import { ExactViteConfiguration } from './configuration.js';
import { createExactViteMicrofrontendIntegration } from './microfrontends.js';
import { createExactViteReactCompatibility } from './react-compatibility.js';
import type { ExactPluginOptions } from './plugin-contracts.js';

/** Creates the configuration owners that must share Vite's application root.
 * Replacements happen before build startup. The caller disposes the preceding intl owner.
 */
export function createExactViteRootOwners(options: ExactPluginOptions) {
	const { compatibility: reactCompatibility, engine: compatibilityEngine } =
		createExactViteReactCompatibility(options);
	return {
		reactCompatibility,
		compatibilityEngine,
		configuration: new ExactViteConfiguration(options),
		intl: new IntlBuildCoordinator({
			applicationRoot: options.applicationRoot,
			configuration: options.internationalization || undefined,
			target: options.target === 'server' ? 'server' : 'client'
		}),
		microfrontends: createExactViteMicrofrontendIntegration(options)
	};
}

/** Selects the shared application root for source transforms and authorization. */
export function exactViteApplicationRoot(
	configuration: ExactViteConfiguration,
	options: ExactPluginOptions
): string {
	return configuration.registry?.applicationRoot ?? options.applicationRoot ?? process.cwd();
}
