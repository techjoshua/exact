import { computed } from '@exactjs/reactive/framework/runtime';
import { createChildRangeReceipt, type ExactChildRangeReceipt } from './child-range-receipt.js';

/** Creates the client operation for a compiler-owned dynamic child range. */
export function createCompiledChildRangeReceipt(
	compute: () => unknown,
	markerId?: string,
	mayReplaceSubtree = true
): ExactChildRangeReceipt {
	return createChildRangeReceipt(computed(compute), markerId, mayReplaceSubtree);
}
