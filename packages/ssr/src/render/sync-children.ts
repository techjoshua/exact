import { type AnyComponentInstance, isVNode } from '@exactjs/core';
import { readPreparedServerRenderProgram } from '@exactjs/core/framework/server-render-structure';
import { unwrap } from '@exactjs/reactive/framework/values';
import { escapeText } from '../html.js';
import type { Child, SsrContext } from '../types.js';
import { boundedJoin, countSsrNode } from './limits.js';
import { claimRootText } from './host.js';
import { renderVNode } from './sync-tree.js';
import { renderPreparedSsrProgramString } from './render-program.js';

/** Serializes primitive and vnode children while preserving adjacent text hydration boundaries. */
export function renderChildren(
	context: SsrContext,
	children: readonly Child[],
	parent?: AnyComponentInstance,
	hasComponentAncestor = false
): string {
	const html: string[] = [];
	let previousWasText = false;
	for (const child of children) {
		let rendered: string;
		const program = readPreparedServerRenderProgram(child);
		if (program)
			rendered = renderPreparedSsrProgramString(
				context,
				program,
				parent,
				(fallback) => renderVNode(context, fallback, parent, hasComponentAncestor),
				(programChildren) => renderChildren(context, programChildren, parent, hasComponentAncestor),
				(component) => renderVNode(context, component, parent, hasComponentAncestor, true)
			);
		else if (isVNode(child)) rendered = renderVNode(context, child, parent, hasComponentAncestor);
		else {
			countSsrNode(context);
			if (child === null || child === undefined || child === false || child === true) rendered = '';
			else {
				claimRootText(context);
				rendered = escapeText(String(unwrap(child)));
			}
		}
		const isText = !program && !isVNode(child) && rendered !== '';
		if (context.textSeparators && isText && previousWasText) html.push('<!-- -->');
		if (rendered !== '') html.push(rendered);
		if (program || isVNode(child)) previousWasText = false;
		else if (isText) previousWasText = true;
	}
	return boundedJoin(context, html);
}
