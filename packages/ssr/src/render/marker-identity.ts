import type { VNode } from '@exactjs/core';
import { exactMarkerId, markerId, markerPair } from '../markup.js';
import type { SsrContext } from '../types.js';

/** Resolves a compiler-owned dynamic marker before falling back to runtime allocation. */
export function dynamicMarkerId(context: SsrContext, vnode: VNode): string {
	const explicit = vnode.props.__exactMarkerId;
	return typeof explicit === 'string'
		? `dynamic:${exactMarkerId(explicit)}`
		: markerId(context, 'dynamic', undefined, vnode.key);
}

/** Renders content inside the dynamic VNode's compiler or runtime marker. */
export function markDynamic(
	context: SsrContext,
	vnode: VNode,
	render: () => Promise<string>
): Promise<string> {
	return markerPair(context, dynamicMarkerId(context, vnode), render);
}
