import { exactExportConditions } from '@exactjs/compiler';
import type { ResolvedReactCompatibility } from '@exactjs/react-compat/plugin';
import type { ExactPluginOptions } from './plugin-contracts.js';
import { viteReactAliases } from './react-compatibility-emission.js';

const viteClientConditions = ['module', 'browser', 'development|production'] as const;
const viteServerConditions = ['module', 'node', 'development|production'] as const;

/** Projects eXact plugin options onto Vite's stable configuration hook result. */
export function exactViteConfig(
	options: ExactPluginOptions,
	reactCompatibility: ResolvedReactCompatibility | undefined
) {
	return {
		...(options.target === 'server'
			? {
					optimizeDeps: { noDiscovery: true as const, include: [] },
					build: { ssrEmitAssets: true as const }
				}
			: {}),
		resolve: {
			// Supplying custom conditions replaces Vite's defaults. Preserve its platform conditions so
			// ordinary packages with browser/default exports do not resolve their server implementation.
			conditions: [
				...exactExportConditions(options.target === 'server' ? 'server' : 'client', options),
				...(options.target === 'server' ? viteServerConditions : viteClientConditions)
			],
			...(reactCompatibility ? { alias: viteReactAliases(reactCompatibility) } : {})
		},
		...(options.configureJsxRuntime === false
			? {}
			: {
					oxc: {
						jsx: {
							runtime: 'automatic' as const,
							importSource: '@exactjs/jsx' as const
						}
					}
				})
	};
}
