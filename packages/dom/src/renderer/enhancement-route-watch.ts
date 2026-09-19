import { watch } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';
import { resolveEnhancementTarget } from './enhancement-targets.js';

/** Tracks selector slots without treating routing-only entries as component declarations. */
export function installEnhancementRouteWatch(root: Root, mounted: Mounted): void {
	mounted.enhancementRouteWatch?.();
	let initialized = false;
	mounted.enhancementRouteWatch = watch(
		() => {
			for (const [identity, values] of mounted.enhancement!.boundaries) {
				for (const boundary of values) {
					resolveEnhancementTarget(boundary, identity, undefined);
				}
			}
			if (initialized) root.reconcileEnhancements?.();
			initialized = true;
		},
		undefined,
		{ scope: mounted.scope }
	);
}
