import {
	computed,
	isReactiveValue,
	peek,
	type ReactiveValue
} from '@exactjs/reactive/framework/runtime';
import type { RenderResult, VNode } from './contracts.js';
import { createVNode } from '../vnode.js';
import { Dynamic } from '../symbols.js';

/** Creates a reactive expression wrapper for compiler-generated expression boundaries. */
export function createExpression<T>(compute: () => T) {
	return computed(compute);
}

/** Reuses a reactive value forwarded through props or observes a plain computed result. */
export function createForwardedExpression<T>(compute: () => T): T | ReactiveValue<T> {
	const value = peek(compute);
	return isReactiveValue(value) ? value : computed(compute);
}

/** Creates a dynamic child VNode whose render result is computed reactively. */
export function createDynamicChild(
	compute: () => RenderResult,
	markerId?: string,
	mayReplaceSubtree = true
): VNode {
	return createVNode(Dynamic, {
		value: computed(compute),
		...(mayReplaceSubtree ? {} : { __exactScalarDynamic: true }),
		...(markerId ? { __exactMarkerId: markerId } : {})
	});
}
