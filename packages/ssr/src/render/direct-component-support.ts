import {
	Fragment,
	createVNode,
	withComponentDomain,
	type ReactiveValue,
	type VNode
} from '@exactjs/core';
import { unwrap } from '@exactjs/reactive/framework/values';
import type { SsrContext } from '../types.js';

/** Minimal request-local receiver for compiler-proven server components. */
export type DirectSsrComponentFrame = Readonly<{
	state: Record<string, unknown>;
	map: typeof directSsrMap;
}>;

/** Creates the request-local receiver shared by synchronous and scheduled direct lanes. */
export function createDirectSsrComponentFrame(): DirectSsrComponentFrame {
	return { state: {}, map: directSsrMap };
}

/** Resolves compiler-emitted expression props without allocating the general readonly proxy. */
export function directSsrProps(rawProps: Record<string, unknown>): Record<string, unknown> {
	let resolved = rawProps;
	for (const key of Object.keys(rawProps)) {
		if (key === 'children') continue;
		const value = unwrap(rawProps[key]);
		if (Object.is(value, rawProps[key])) continue;
		if (resolved === rawProps) resolved = { ...rawProps };
		resolved[key] = value;
	}
	return resolved;
}

/** Executes component work in the request's error and inspection domain when present. */
export function inComponentDomain<T>(context: SsrContext, work: () => T): T {
	return context.componentDomain ? withComponentDomain(context.componentDomain, work) : work();
}

/** Materializes a compiler-generated keyed-list fallback without retained registration. */
function directSsrMap<T>(
	collection: Iterable<T> | ReactiveValue<Iterable<T>>,
	key: (item: T) => string,
	render: (item: T) => VNode,
	id?: string
): VNode {
	return createVNode(Fragment, {
		key: id,
		list: { collection: unwrap(collection) as Iterable<T>, key, render }
	});
}
