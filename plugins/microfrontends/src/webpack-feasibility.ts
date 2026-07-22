import path from 'node:path';
import {
	generateProvidedPackageBridge,
	planProvidedPackageBridge,
	type ExactProvidedPackageImportUsage
} from './artifacts.js';
import type { ExactRemoteArtifactPlan } from './build.js';

/**
 * Focused Webpack hook mapping used to approve the common artifact boundary.
 * This is not an advertised production adapter.
 */
export function createExactWebpackFeasibilityMapping(options: {
	plan: ExactRemoteArtifactPlan;
	applicationRoot: string;
	registrationModules: Readonly<Record<string, string>>;
}) {
	const modules = new Map<string, string>();
	const entries: Record<string, string> = {};
	for (const exposure of options.plan.exposures) {
		const name = exposure.exposure.replace(/^\.\//, '').replace(/[^A-Za-z0-9_-]+/g, '-');
		entries[`exact-remote-${name || 'entry'}`] = exposure.entryId;
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
		entries: Object.freeze(entries),
		output: Object.freeze({
			module: true,
			chunkFormat: 'module' as const,
			chunkLoading: 'import' as const,
			publicPath: 'auto' as const
		}),
		loadVirtualModule(id: string): string | undefined {
			return modules.get(id);
		},
		providedBridge(key: string, usages: readonly ExactProvidedPackageImportUsage[]): string {
			if (!options.plan.providedPackages.includes(key))
				throw new Error(`Package ${JSON.stringify(key)} is not configured as provided`);
			return generateProvidedPackageBridge(planProvidedPackageBridge(key, usages));
		}
	});
}
