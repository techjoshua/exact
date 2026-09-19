import { computed } from '@exactjs/reactive/framework/runtime';
import { currentComponentDomain, withComponentDomain } from '../component/domain.js';
import { createChildRangeReceipt, type ExactChildRangeReceipt } from './child-range-receipt.js';

/** Creates the client operation for a compiler-owned dynamic child range. */
export function createCompiledChildRangeReceipt(
	compute: () => unknown,
	markerId?: string,
	mayReplaceSubtree = true
): ExactChildRangeReceipt {
	// Later structural reads must issue children in the same domain as their initial render.
	// Otherwise matching intrinsic/component receipts appear to change ownership on update.
	const domain = mayReplaceSubtree ? currentComponentDomain() : undefined;
	const read = domain ? () => withComponentDomain(domain, compute) : compute;
	return createChildRangeReceipt(computed(read), markerId, mayReplaceSubtree);
}
