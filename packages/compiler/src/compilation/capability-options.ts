import type { TransformOptions } from '../types.js';

/** Configures capability compilation. */
export type CapabilityCompilationOptions = Pick<
	TransformOptions,
	'packageType' | 'packageName' | 'capabilityPolicy'
>;

/** Performs the capability compilation options domain operation. */
export function capabilityCompilationOptions(
	options: CapabilityCompilationOptions
): CapabilityCompilationOptions {
	return {
		packageType: options.packageType,
		packageName: options.packageName,
		capabilityPolicy: options.capabilityPolicy
	};
}
