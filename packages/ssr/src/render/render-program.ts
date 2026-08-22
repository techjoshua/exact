import {
	type AnyComponentInstance,
	isVNode,
	normalizeRenderResult,
	unwrap,
	withComponentDomain,
	type VNode
} from '@exactjs/core';
import { RenderProgram } from '@exactjs/core/runtime/render';
import type { ExactTableRenderProgram } from '@exactjs/core/runtime/render';
import {
	readRenderProgram,
	readRenderProgramSlot,
	renderProgramFallback
} from '@exactjs/core/runtime/render';
import { withEffectScope } from '@exactjs/reactive';
import { escapeText } from '../html.js';
import { exactMarkerId, renderAttrs } from '../markup.js';
import { appendBoundedHtml, countSsrNode } from './limits.js';
import type { Child, SsrContext } from '../types.js';

/** Executes the compiler-native scalar subset or selects its lazy generic fallback. */
export function renderSsrProgram(
	context: SsrContext,
	vnode: VNode,
	owner?: AnyComponentInstance,
	renderChildren?: (children: readonly Child[]) => string
): { readonly html?: string; readonly fallback?: VNode } {
	const invocation = readRenderProgram(vnode);
	if (!invocation || context.reactMarkup)
		return { fallback: materializeProgramFallback(vnode, owner) };
	const { program } = invocation;
	if (program.directClaims) return { fallback: materializeProgramFallback(vnode, owner) };
	if (!program.parts || program.parts.length !== program.slots.length + 1)
		return { fallback: materializeProgramFallback(vnode, owner) };
	if (context.markers && !hasValidSsrOperations(program))
		return { fallback: materializeProgramFallback(vnode, owner) };
	const values = new Array<unknown>(program.slots.length);
	for (let index = 0; index < program.slots.length; index++) {
		const slot = program.slots[index]!;
		const value = unwrap(readRenderProgramSlot(invocation, index));
		if (
			value instanceof Promise ||
			(slot[0] === 'text' && (isVNode(value) || Array.isArray(value)))
		)
			return { fallback: materializeProgramFallback(vnode, owner) };
		values[index] = value;
		countSsrNode(context);
	}
	if (
		!renderChildren &&
		program.slots.some((slot) => slot[0] === 'child' || slot[0] === 'component')
	)
		return { fallback: materializeProgramFallback(vnode, owner) };
	for (let index = 1; index < program.nodes.length; index++) countSsrNode(context);
	if (context.markers) return renderMarkedProgram(context, program, values, renderChildren);
	let html = program.parts[0] ?? '';
	for (let index = 0; index < values.length; index++) {
		html = appendBoundedHtml(
			context,
			html,
			renderProgramSlot(context, program, index, values[index], renderChildren)
		);
		html = appendBoundedHtml(context, html, program.parts[index + 1] ?? '');
	}
	return { html };
}

function renderMarkedProgram(
	context: SsrContext,
	program: ExactTableRenderProgram,
	values: readonly unknown[],
	renderChildren?: (children: readonly Child[]) => string
): { readonly html: string } {
	const parts = program.ssrParts!;
	const operations = program.ssrOperations!;
	let html = parts[0] ?? '';
	const markerBase = context.nextId;
	// Reserve compiler-owned node identities before nested structural slots allocate their own
	// component, list, or fragment markers. This keeps every identity unique and monotonic.
	context.nextId += program.nodes.length;
	for (let position = 0; position < operations.length; position++) {
		const operation = operations[position]!;
		if (operation.kind === 'slot') {
			const slot = program.slots[operation.index]!;
			const rendered = renderProgramSlot(
				context,
				program,
				operation.index,
				values[operation.index],
				renderChildren
			);
			html = appendBoundedHtml(
				context,
				html,
				(slot[0] === 'text' || slot[0] === 'child' || slot[0] === 'component') && slot[1]
					? `<!--exact:dynamic:${exactMarkerId(slot[1])}-->${rendered}<!--/exact:dynamic:${exactMarkerId(slot[1])}-->`
					: slot[0] === 'text'
						? ''
						: rendered
			);
		} else {
			const id = `cell:${markerBase + operation.index}`;
			html = appendBoundedHtml(
				context,
				html,
				operation.kind === 'node-open'
					? `<!--exact:${id}-->`
					: operation.kind === 'node-close'
						? `<!--/exact:${id}-->`
						: ''
			);
		}
		html = appendBoundedHtml(context, html, parts[position + 1] ?? '');
	}
	return { html };
}

function hasValidSsrOperations(program: ExactTableRenderProgram): boolean {
	if (
		!program.ssrParts ||
		!program.ssrOperations ||
		program.ssrParts.length !== program.ssrOperations.length + 1
	)
		return false;
	for (const operation of program.ssrOperations) {
		if (!Number.isSafeInteger(operation.index) || operation.index < 0) return false;
		if (operation.kind === 'slot') {
			if (operation.index >= program.slots.length) return false;
			const slot = program.slots[operation.index]!;
			if (slot[0] === 'text' && !slot[1]) return false;
		} else if (
			(operation.kind === 'node-open' || operation.kind === 'node-close') &&
			operation.index < program.nodes.length
		) {
			continue;
		} else return false;
	}
	return true;
}

function renderProgramSlot(
	context: SsrContext,
	program: ExactTableRenderProgram,
	index: number,
	value: unknown,
	renderChildren?: (children: readonly Child[]) => string
): string {
	const slot = program.slots[index]!;
	if (slot[0] === 'text')
		return value === null || value === undefined || value === false || value === true
			? ''
			: escapeText(String(value));
	if (slot[0] === 'child' || slot[0] === 'component')
		return renderChildren ? renderChildren(normalizeRenderResult(value as Child | Child[])) : '';
	if (!slot[2]) return '';
	const node = program.nodes[slot[1]];
	return renderAttrs({ [slot[2]]: value }, false, node?.[1], context);
}

/** Handles a render-program string node while leaving every other vnode untouched. */
export function renderSsrProgramString(
	context: SsrContext,
	vnode: VNode,
	owner: AnyComponentInstance | undefined,
	renderFallback: (fallback: VNode) => string,
	renderChildren: (children: readonly Child[]) => string
): string | undefined {
	if (vnode.type !== RenderProgram) return undefined;
	const planned = renderSsrProgram(context, vnode, owner, renderChildren);
	return planned.fallback ? renderFallback(planned.fallback) : planned.html!;
}

/** Handles a render-program chunk node without buffering its generic fallback. */
export function renderSsrProgramChunks(
	context: SsrContext,
	vnode: VNode,
	owner: AnyComponentInstance | undefined,
	renderFallback: (fallback: VNode) => Iterable<string>
): Iterable<string> | undefined {
	if (vnode.type !== RenderProgram) return undefined;
	const planned = renderSsrProgram(context, vnode, owner);
	return planned.fallback ? renderFallback(planned.fallback) : [planned.html!];
}

/** Re-enters the component owner while a marker-mode fallback allocates reactive VNodes. */
function materializeProgramFallback(vnode: VNode, owner: AnyComponentInstance | undefined): VNode {
	const fallback = !owner
		? renderProgramFallback(vnode)
		: withEffectScope(owner.scope, () =>
				withComponentDomain(owner.domain, () => renderProgramFallback(vnode))
			);
	if (!fallback)
		throw new Error('Client-only compiler render programs cannot execute through SSR fallback');
	return fallback;
}
