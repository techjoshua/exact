import { exactExportConditions } from '@exactjs/compiler';
import {
	applicationExactFrameworkPackages,
	applicationExactComponentLibraryNames
} from '@exactjs/compiler/adapter-support';
import type { ResolvedReactCompatibility } from '@exactjs/react-compat/plugin';
import type { ExactPluginOptions } from './plugin-contracts.js';
import { viteReactAliases } from './react-compatibility-emission.js';

const viteClientConditions = ['module', 'browser', 'development|production'] as const;
const viteServerConditions = ['module', 'node', 'development|production'] as const;

/** Projects eXact plugin options onto Vite's stable configuration hook result. */
export async function exactViteConfig(
	options: ExactPluginOptions,
	reactCompatibility: ResolvedReactCompatibility | undefined
) {
	const libraries = await applicationExactComponentLibraryNames(
		options.applicationRoot ?? process.cwd()
	);
	const frameworkPackages = applicationExactFrameworkPackages(
		options.applicationRoot ?? process.cwd()
	);
	// Facades load runtime subpaths directly. Optimizing another runtime entry would duplicate
	// its bundled capabilities beside those direct imports in the same browser realm.
	const optimizerExcludes = libraries.length ? [...libraries, ...frameworkPackages] : [];
	const optimizerJsx =
		options.configureJsxRuntime === false
			? {}
			: {
					rolldownOptions: {
						transform: { jsx: { runtime: 'automatic' as const, importSource: '@exactjs/jsx' } }
					}
				};
	return {
		// SSR must traverse renderer facades, target exports, and catalog registrations together.
		// Vite otherwise externalizes installed packages before our resolution hooks run.
		ssr: {
			noExternal: [/^@exactjs\//, ...libraries]
		},
		// Optimized library reexports can discard renderer activation imports under sideEffects rules.
		// Keep published components in the plugin graph that owns their enhancement facades.
		optimizeDeps: { exclude: optimizerExcludes, ...optimizerJsx },
		...(options.target === 'server'
			? {
					optimizeDeps: {
						noDiscovery: true as const,
						include: [],
						exclude: optimizerExcludes,
						...optimizerJsx
					},
					build: { ssrEmitAssets: true as const }
				}
			: {}),
		resolve: {
			dedupe: frameworkPackages,
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
