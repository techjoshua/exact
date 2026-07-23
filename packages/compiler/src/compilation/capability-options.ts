import type { TransformOptions } from '../types.js';

/** Configures capability compilation. */
export type CapabilityCompilationOptions = Pick<
	TransformOptions,
	'packageType' | 'packageName' | 'capabilityPolicy'
>;

/** Performs the capability compilation options domain operation. */
export function capabilityCompilationOptions(
	options: CapabilityCompilationOptions & Pick<TransformOptions, 'pluginRegistry'>
): CapabilityCompilationOptions {
	const configuredPackages = secretPackagesFromPluginRegistry(options.pluginRegistry);
	const capabilityPolicy =
		configuredPackages && !options.capabilityPolicy?.secrets
			? {
					...options.capabilityPolicy,
					secrets: { allowPackages: configuredPackages }
				}
			: options.capabilityPolicy;
	return {
		packageType: options.packageType,
		packageName: options.packageName,
		capabilityPolicy
	};
}

function secretPackagesFromPluginRegistry(
	registry: TransformOptions['pluginRegistry']
): readonly string[] | undefined {
	const cacheKey = registry?.plugins['@exactjs/secrets']?.cacheKey;
	if (!cacheKey || typeof cacheKey !== 'object' || Array.isArray(cacheKey)) return undefined;
	const allowPackages = (cacheKey as Record<string, unknown>).allowPackages;
	return Array.isArray(allowPackages) &&
		allowPackages.every((packageName) => typeof packageName === 'string' && packageName.length)
		? allowPackages
		: undefined;
}
