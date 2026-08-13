import { exactExportConditions } from '@exactjs/compiler';
import type { ResolvedReactCompatibility } from '@exactjs/react-compat/plugin';
import type { ExactPluginOptions } from './plugin-contracts.js';
import { viteReactAliases } from './react-compatibility-emission.js';

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
			conditions: exactExportConditions(options.target === 'server' ? 'server' : 'client', options),
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
