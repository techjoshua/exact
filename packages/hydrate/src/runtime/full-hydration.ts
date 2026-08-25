import type { VNode } from '@exactjs/core';
import { resolveHydrateOptions } from '../config.js';
import type { HydrateOptions, HydrationRoot } from '../types.js';
import { createExactClientFromResolvedOptions } from './client.js';
import { hydrateWithClient } from './hydration.js';

/** Hydrates with the complete request, patch, island, and registration client capabilities. */
export function hydrate(
	vnode: VNode,
	container: Element | Document,
	options: HydrateOptions = {}
): HydrationRoot {
	return hydrateWithClient(
		vnode,
		container,
		options,
		createExactClientFromResolvedOptions,
		resolveHydrateOptions
	);
}
