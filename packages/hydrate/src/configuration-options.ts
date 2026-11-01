import type { ExactHydrationConfig, HydrateOptions } from './types.js';
import { sameExactComponentAuthorization } from '@exactjs/core';
import { deriveRuntimeConfiguration } from '@exactjs/core/framework/configuration';

/** Validates shared bootstrap identity and derives root-local defaults without dropping options. */
export function resolveHydrationConfiguration(
	options: HydrateOptions,
	config: ExactHydrationConfig,
	extensions?: () => Partial<HydrateOptions>
): HydrateOptions {
	if (
		config.pluginRegistryFingerprint &&
		options.clientPluginRegistryFingerprint &&
		config.pluginRegistryFingerprint !== options.clientPluginRegistryFingerprint
	)
		throw new Error('Client and server eXact plugin registry fingerprints do not match');
	if (config.buildKey && options.buildKey && config.buildKey !== options.buildKey)
		throw new Error('Client and server eXact build identities do not match');
	if (
		config.componentAuthorization &&
		options.componentAuthorization &&
		!sameExactComponentAuthorization(config.componentAuthorization, options.componentAuthorization)
	)
		throw new Error('Client and server component authorization fingerprints do not match');
	const componentAuthorization = options.componentAuthorization ?? config.componentAuthorization;
	const buildKey = options.buildKey ?? config.buildKey;
	if (componentAuthorization && buildKey && componentAuthorization.buildKey !== buildKey)
		throw new Error('Component authorization identity does not match the hydration build key');
	return deriveRuntimeConfiguration(options, () => ({
		...extensions?.(),
		state: options.state === undefined ? config.state : options.state,
		markerlessRoot: options.markerlessRoot ?? config.markerlessRoot,
		allowMarkerless: options.allowMarkerless ?? config.markerlessRoot,
		resumptions: options.resumptions ?? config.resumptions,
		publicContexts: options.publicContexts ?? config.publicContexts,
		wallClockSnapshot: options.wallClockSnapshot ?? config.wallClockSnapshot,
		hydrationTable: options.hydrationTable ?? config.hydrationTable,
		executionRoot: options.executionRoot ?? config.executionRoot,
		binding: options.binding ?? config.binding,
		buildKey,
		componentAuthorization,
		headers: componentAuthorization
			? {
					...options.headers,
					'X-Exact-Component-Authorization': componentAuthorization.fingerprint
				}
			: options.headers
	}));
}
