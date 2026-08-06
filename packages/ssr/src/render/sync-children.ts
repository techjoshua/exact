import { isVNode, type ComponentInstance } from '@exactjs/core';
import { unwrap } from '@exactjs/reactive';
import { escapeText } from '../html.js';
import type { Child, SsrContext } from '../types.js';
import { boundedJoin, countSsrNode } from './limits.js';
import { claimRootText } from './host.js';
import { renderVNode } from './sync-tree.js';

/** Serializes primitive and vnode children while preserving adjacent text hydration boundaries. */
export function renderChildren(
	context: SsrContext,
	children: readonly Child[],
	parent?: ComponentInstance<any>
): string {
	const html: string[] = [];
	let previousWasText = false;
	for (const child of children) {
		let rendered: string;
		if (isVNode(child)) rendered = renderVNode(context, child, parent);
		else {
			countSsrNode(context);
			if (child === null || child === undefined || child === false || child === true) rendered = '';
			else {
				claimRootText(context);
				rendered = escapeText(String(unwrap(child)));
			}
		}
		const isText = !isVNode(child) && rendered !== '';
		if (context.textSeparators && isText && previousWasText) html.push('<!-- -->');
		if (rendered !== '') html.push(rendered);
		if (isVNode(child)) previousWasText = false;
		else if (isText) previousWasText = true;
	}
	return boundedJoin(context, html);
}
