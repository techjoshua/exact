import {
	RenderProgram,
	isVNode,
	readRenderProgram,
	renderProgramFallback,
	unwrap,
	type VNode
} from '@exactjs/core';
import { escapeText } from '../html.js';
import { boundedJoin, countSsrNode } from './limits.js';
import type { SsrContext } from '../types.js';

/** Executes the compiler-native scalar subset or selects its lazy generic fallback. */
export function renderSsrProgram(
	context: SsrContext,
	vnode: VNode
): { readonly html?: string; readonly fallback?: VNode } {
	const invocation = readRenderProgram(vnode);
	if (!invocation || context.markers || context.reactMarkup || context.textSeparators)
		return { fallback: renderProgramFallback(vnode) };
	const { program, readers } = invocation;
	if (program.parts.length !== readers.length + 1)
		return { fallback: renderProgramFallback(vnode) };
	const output: string[] = [program.parts[0] ?? ''];
	for (let index = 0; index < readers.length; index++) {
		const value = unwrap(readers[index]!());
		if (isVNode(value) || Array.isArray(value) || value instanceof Promise)
			return { fallback: renderProgramFallback(vnode) };
		countSsrNode(context);
		if (value !== null && value !== undefined && value !== false && value !== true)
			output.push(escapeText(String(value)));
		output.push(program.parts[index + 1] ?? '');
	}
	for (let index = 1; index < program.nodes.length; index++) countSsrNode(context);
	return { html: boundedJoin(context, output) };
}

/** Handles a render-program string node while leaving every other vnode untouched. */
export function renderSsrProgramString(
	context: SsrContext,
	vnode: VNode,
	renderFallback: (fallback: VNode) => string
): string | undefined {
	if (vnode.type !== RenderProgram) return undefined;
	const planned = renderSsrProgram(context, vnode);
	return planned.fallback ? renderFallback(planned.fallback) : planned.html!;
}

/** Handles a render-program chunk node without buffering its generic fallback. */
export function renderSsrProgramChunks(
	context: SsrContext,
	vnode: VNode,
	renderFallback: (fallback: VNode) => Iterable<string>
): Iterable<string> | undefined {
	if (vnode.type !== RenderProgram) return undefined;
	const planned = renderSsrProgram(context, vnode);
	return planned.fallback ? renderFallback(planned.fallback) : [planned.html!];
}
