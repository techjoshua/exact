import {
	prepareExactPluginRegistry,
	type ExactPreparedPluginRegistry,
	type PrepareExactPluginRegistryOptions
} from '@exact/plugin-host/node';

export type {
	ExactPreparedPluginRegistry,
	PrepareExactPluginRegistryOptions
} from '@exact/plugin-host/node';

/** Prepares and validates server plugins during Node application startup. */
export function prepareExactServerPlugins(
	options: Omit<PrepareExactPluginRegistryOptions, 'hostMode'> = {}
): Promise<ExactPreparedPluginRegistry> {
	return prepareExactPluginRegistry({ ...options, hostMode: 'server' });
}
