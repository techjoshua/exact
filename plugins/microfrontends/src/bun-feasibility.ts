import path from 'node:path';
import {
	generateProvidedPackageBridge,
	planProvidedPackageBridge,
	type ExactProvidedPackageImportUsage
} from './artifacts.js';
import type { ExactRemoteArtifactPlan } from './build.js';

/**
 * Focused Bun onResolve/onLoad mapping used to approve the common artifact
 * boundary. This is not an advertised production adapter.
 */
export function createExactBunFeasibilityMapping(options: {
	plan: ExactRemoteArtifactPlan;
	applicationRoot: string;
	registrationModules: Readonly<Record<string, string>>;
}) {
	const modules = new Map<string, string>();
	const entrypoints: string[] = [];
	for (const exposure of options.plan.exposures) {
		entrypoints.push(exposure.entryId);
		modules.set(exposure.entryId, exposure.entrySource);
		modules.set(
			exposure.componentFacadeId,
			`export { default } from ${JSON.stringify(path.resolve(options.applicationRoot, exposure.component))};\n`
		);
		const registration = options.registrationModules[exposure.exposure];
		if (!registration)
			throw new Error(
				`Missing hydration registration for remote exposure ${JSON.stringify(exposure.exposure)}`
			);
		modules.set(exposure.registrationId, registration);
	}
	return Object.freeze({
		entrypoints: Object.freeze(entrypoints),
		namespace: 'exact-remote-artifact' as const,
		onResolve(pathname: string): { path: string; namespace: string } | undefined {
			return modules.has(pathname)
				? { path: pathname, namespace: 'exact-remote-artifact' }
				: undefined;
		},
		onLoad(pathname: string): { contents: string; loader: 'js' } | undefined {
			const contents = modules.get(pathname);
			return contents === undefined ? undefined : { contents, loader: 'js' };
		},
		providedBridge(
			key: string,
			usages: readonly ExactProvidedPackageImportUsage[]
		): { contents: string; loader: 'js' } {
			if (!options.plan.providedPackages.includes(key))
				throw new Error(`Package ${JSON.stringify(key)} is not configured as provided`);
			return {
				contents: generateProvidedPackageBridge(planProvidedPackageBridge(key, usages)),
				loader: 'js'
			};
		}
	});
}
