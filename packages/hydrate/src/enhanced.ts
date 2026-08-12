import { withExactEnhancementCatalog } from '@exactjs/core/framework/enhancement-catalog';
import type { VNode } from '@exactjs/core';
import { hydrate as hydrateDom } from './runtime/full-hydration.js';
import type { HydrateOptions, HydrationRoot } from './types.js';

export * from './public.js';

/** Hydrates with the compiler-observed enhancement components in this application bundle. */
export function hydrate(
	vnode: VNode,
	container: Element | Document,
	options: HydrateOptions = {}
): HydrationRoot {
	return hydrateDom(vnode, container, withExactEnhancementCatalog(options));
}
