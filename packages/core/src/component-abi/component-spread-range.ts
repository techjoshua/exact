import { unwrap } from '@exactjs/reactive/framework/values';
import { createOwnedChildRangeValue } from './compiled-child-range.js';
import { createChildRangeReceipt } from './child-range-receipt.js';
import { opaqueOperationKey } from './opaque-operation.js';

/**
 * Observes copied component props while retaining the final authored sibling key.
 * Identity resolves when the renderer reads it, after provider preparation. The
 * cached computation supplies both props and keys without repeating authored evaluation.
 */
export function createCompiledComponentSpreadRange(compute: () => unknown, markerId?: string) {
	const value = createOwnedChildRangeValue(compute);
	return createChildRangeReceipt(value, markerId, true, undefined, () =>
		opaqueOperationKey(unwrap(value))
	);
}
