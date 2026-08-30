import { resolveExactArtifactImport } from '@exactjs/compiler';
import { validateInstalledReactReconciler } from '@exactjs/react-compat/plugin';
import path from 'node:path';
import type { ExactPluginOptions } from './plugin-contracts.js';
import { exactTransformTargetForModule, exactViteRequestTarget } from './module-selection.js';

/** Resolves target-local framework imports and validates explicit React reconciler ownership. */
export function resolveExactFrameworkImport(
	source: string,
	importer: string | undefined,
	options: ExactPluginOptions,
	compatibilityTarget: Parameters<typeof validateInstalledReactReconciler>[0] | undefined,
	ssr?: boolean
): string | null {
	if (source === 'react-reconciler' && compatibilityTarget)
		validateInstalledReactReconciler(
			compatibilityTarget,
			importer ? path.dirname(importer) : process.cwd()
		);
	return (
		resolveExactArtifactImport(
			source,
			importer,
			exactTransformTargetForModule(
				importer ?? source,
				options,
				exactViteRequestTarget(options, ssr)
			)
		)?.id ?? null
	);
}
