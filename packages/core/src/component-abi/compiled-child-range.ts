import { computed } from '@exactjs/reactive/framework/runtime';
import { currentComponentDomain, withComponentDomain } from '../component/domain.js';
import { createChildRangeReceipt, type ExactChildRangeReceipt } from './child-range-receipt.js';

/** Creates the client operation for a compiler-owned dynamic child range. */
export function createCompiledChildRangeReceipt(
	compute: () => unknown,
	markerId?: string,
	mayReplaceSubtree = true
): ExactChildRangeReceipt {
	return createChildRangeReceipt(
		createOwnedChildRangeValue(compute, mayReplaceSubtree),
		markerId,
		mayReplaceSubtree
	);
}

/** Keeps deferred structural reads in their initial component domain and caches one computed copy. */
export function createOwnedChildRangeValue(compute: () => unknown, mayReplaceSubtree = true) {
	// Matching children retain ownership when later reads execute outside the initial render.
	const domain = mayReplaceSubtree ? currentComponentDomain() : undefined;
	const read = domain ? () => withComponentDomain(domain, compute) : compute;
	return computed(read);
}
