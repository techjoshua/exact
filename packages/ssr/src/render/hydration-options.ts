import type { HydrationScriptOptions, RenderToStringResult } from '../types.js';

/** Projects every hydration-publication option while replacing values captured during rendering. */
export function hydrationScriptOptions(
	options: HydrationScriptOptions,
	result: RenderToStringResult,
	resumptions: HydrationScriptOptions['resumptions']
): HydrationScriptOptions {
	return hydrationScriptOptionsFromValues(
		options,
		result.state,
		result.wallClockSnapshot,
		result.hydrationTable,
		resumptions
	);
}

/** Projects hydration options directly from one completed request-owned render output. */
export function hydrationScriptOptionsFromValues(
	options: HydrationScriptOptions,
	state: unknown,
	wallClockSnapshot: number | undefined,
	hydrationTable: RenderToStringResult['hydrationTable'],
	resumptions: HydrationScriptOptions['resumptions']
): HydrationScriptOptions {
	const projected = {
		pluginRegistryFingerprint: options.pluginRegistryFingerprint,
		endpoint: options.endpoint,
		endpoints: options.endpoints,
		state,
		publishRootProps: undefined,
		markerlessRoot: options.markerlessRoot,
		continuations: options.continuations,
		resumptions,
		publicContexts: options.publicContexts,
		wallClockSnapshot,
		hydrationTable,
		executionRoot: options.executionRoot,
		binding: options.binding,
		buildKey: options.buildKey,
		componentAuthorization: options.componentAuthorization,
		scriptId: options.scriptId,
		nonce: options.nonce,
		maxHydrationDepth: options.maxHydrationDepth,
		maxHydrationNodes: options.maxHydrationNodes,
		maxHydrationBytes: options.maxHydrationBytes,
		outputExtensions: options.outputExtensions
	} satisfies Record<keyof HydrationScriptOptions, unknown>;
	return projected;
}
