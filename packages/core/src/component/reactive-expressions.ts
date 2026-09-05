import {
	computed,
	isReactiveValue,
	peek,
	type ReactiveValue
} from '@exactjs/reactive/framework/runtime';
import type { RenderResult } from './contracts.js';
import {
	createChildRangeReceipt,
	type ExactChildRangeReceipt
} from '../component-abi/child-range-receipt.js';

export { createCompiledChildRangeReceipt } from '../component-abi/compiled-child-range.js';

/** Creates a reactive expression wrapper for compiler-generated expression boundaries. */
export function createExpression<T>(compute: () => T) {
	return computed(compute);
}

/** Reuses a forwarded reactive value or observes a plain computed result. */
export function createForwardedExpression<T>(compute: () => T): T | ReactiveValue<T> {
	const value = peek(compute);
	return isReactiveValue(value) ? value : computed(compute);
}

/** Creates a focused reactive child-range operation. */
export function createDynamicChild(
	compute: () => RenderResult,
	markerId?: string,
	mayReplaceSubtree = true
): ExactChildRangeReceipt {
	return createChildRangeReceipt(computed(compute), markerId, mayReplaceSubtree);
}
