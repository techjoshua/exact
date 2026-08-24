import type { VNode } from '@exactjs/core';
import { markerPair } from '../markup.js';
import type { SsrContext } from '../types.js';
import { renderResumableComponentBoundary } from './resumption-boundary-capability.js';

/** Wraps completed component HTML in the compiler-selected root or resumption boundary. */
export function componentHtml(
	context: SsrContext,
	vnode: VNode,
	componentId: string,
	html: string,
	props: Record<string, unknown>,
	flags: { enhancement: boolean; documentProbe: boolean; hasComponentAncestor: boolean }
): string {
	return flags.enhancement || (flags.documentProbe && context.documentRootSeen)
		? html
		: flags.hasComponentAncestor
			? renderResumableComponentBoundary(context, vnode, componentId, html, props)
			: markerPair(context, componentId, () => html);
}
