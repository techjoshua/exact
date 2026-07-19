import {
	prepareExactPluginRegistry,
	type ExactPreparedPluginRegistry,
	type PrepareExactPluginRegistryOptions
} from '@exact/plugin-host/node';

export type {
	ExactPreparedPluginRegistry,
	PrepareExactPluginRegistryOptions
} from '@exact/plugin-host/node';

/** Prepares render policies and projections during Node application startup. */
export function prepareExactRenderPlugins(
	options: Omit<PrepareExactPluginRegistryOptions, 'hostMode'> = {}
): Promise<ExactPreparedPluginRegistry> {
	return prepareExactPluginRegistry({ ...options, hostMode: 'render' });
}
