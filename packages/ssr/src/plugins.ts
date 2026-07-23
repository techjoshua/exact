import {
	prepareExactPluginRegistry,
	type ExactPreparedPluginRegistry,
	type PrepareExactPluginRegistryOptions
} from '@exactjs/plugin-host/node';

export type {
	ExactPreparedPluginRegistry,
	PrepareExactPluginRegistryOptions
} from '@exactjs/plugin-host/node';

/** Prepares render policies and projections during Node application startup. */
export function prepareExactRenderPlugins(
	options: Omit<PrepareExactPluginRegistryOptions, 'hostMode'> = {}
): Promise<ExactPreparedPluginRegistry> {
	return prepareExactPluginRegistry({ ...options, hostMode: 'render' });
}
