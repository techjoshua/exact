import { isVNode, type AnyComponentInstance, type Child, type VNode } from '@exactjs/core';
import { RenderProgram } from '@exactjs/core/framework/server-render-structure';
import { unwrap } from '@exactjs/reactive/framework/values';
import { escapeText } from '../html.js';
import type { SsrContext } from '../types.js';
import { componentMarkerId } from './component-markers.js';
import { renderDirectSsrComponentVNode } from './direct-component.js';
import type { SsrRenderOptions } from './entrypoints.js';
import {
	assertOutputCharacterBound,
	boundedJoin,
	countSsrNode,
	enterSsrTreeDepth,
	leaveSsrTreeDepth
} from './limits.js';
import { renderSsrProgram } from './render-program.js';

/** Serializes a compiler-closed child list without loading the universal async VNode dispatcher. */
export async function renderCompilerClosedChildren(
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
): Promise<string> {
	const html: string[] = [];
	let previousWasText = false;
	for (const child of children) {
		const rendered = await renderCompilerClosedChild(context, child, parent, options);
		const text = !isVNode(child) && rendered !== '';
		if (context.textSeparators && text && previousWasText) html.push('<!-- -->');
		if (rendered !== '') html.push(rendered);
		previousWasText = text;
	}
	return boundedJoin(context, html);
}

async function renderCompilerClosedChild(
	context: SsrContext,
	child: Child,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
): Promise<string> {
	if (isVNode(child)) return renderCompilerClosedVNode(context, child, parent, options);
	countSsrNode(context);
	if (child === null || child === undefined || child === false || child === true) return '';
	return escapeText(String(unwrap(child)));
}

/** Serializes only VNode kinds emitted by a compiler-closed server component artifact. */
export async function renderCompilerClosedVNode(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
): Promise<string> {
	enterSsrTreeDepth(context);
	try {
		countSsrNode(context);
		let html: string;
		if (vnode.type === RenderProgram) {
			const planned = renderSsrProgram(context, vnode, parent);
			if (planned.fallback)
				throw new TypeError('Compiler-closed SSR artifact selected a generic render fallback');
			const segments: string[] = [];
			for (const segment of planned.segments!)
				segments.push(
					typeof segment === 'string'
						? segment
						: await renderCompilerClosedChildren(context, segment, parent, options)
				);
			html = boundedJoin(context, segments);
		} else if (typeof vnode.type === 'function') {
			const componentId = componentMarkerId(context, vnode);
			const rendered = await renderDirectSsrComponentVNode(
				context,
				vnode,
				parent,
				options,
				componentId,
				{ enhancement: false, documentProbe: context.documentProbe },
				(children, owner) => renderCompilerClosedChildren(context, children, owner, options)
			);
			if (rendered === undefined)
				throw new TypeError('Compiler-closed SSR root reached a generic component artifact');
			html = rendered;
		} else {
			throw new TypeError('Compiler-closed SSR artifact emitted an unsupported VNode kind');
		}
		assertOutputCharacterBound(context, html);
		return html;
	} finally {
		leaveSsrTreeDepth(context);
	}
}
