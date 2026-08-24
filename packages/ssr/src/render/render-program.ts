import {
	type AnyComponentInstance,
	isVNode,
	normalizeRenderResult,
	type VNode
} from '@exactjs/core';
import { unwrap } from '@exactjs/reactive/framework/values';
import { RenderProgram } from '@exactjs/core/framework/render-structure';
import type { ExactRenderProgramSsrOperations } from '@exactjs/core/framework/render-structure';
import {
	readRenderProgram,
	readRenderProgramSlot,
	renderProgramFallback
} from '@exactjs/core/framework/render-structure';
import { escapeText } from '../html.js';
import { exactMarkerId, renderAttrs } from '../markup.js';
import { boundedJoin, countSsrNodes, SsrOutputLimitError } from './limits.js';
import type { Child, SsrContext } from '../types.js';
import { withRenderProgramOwner } from './render-program-owner-capability.js';

/** Executes the compiler-native scalar subset or selects its lazy generic fallback. */
export function renderSsrProgram(
	context: SsrContext,
	vnode: VNode,
	owner?: AnyComponentInstance
): {
	readonly html?: string;
	readonly segments?: readonly DeferredSsrSegment[];
	readonly fallback?: VNode;
} {
	const invocation = readRenderProgram(vnode);
	if (!invocation || context.reactMarkup)
		return { fallback: materializeProgramFallback(vnode, owner) };
	const { program } = invocation;
	if (program.ssr) {
		const output = program.ssr(generatedSsrOperations, context, invocation);
		if (!output) return { fallback: materializeProgramFallback(vnode, owner) };
		return { segments: output as DeferredSsrSegment[] };
	}
	return { fallback: materializeProgramFallback(vnode, owner) };
}

type DeferredSsrSegment = string | readonly Child[];

/**
 * Supplies stateless serialization operations to one compiler-generated server lane.
 *
 * A compiler-emitted preparation prefix reads and validates every slot before later generated
 * calls can mutate the SSR context. This preserves local fallback semantics without making the
 * runtime rediscover component topology from an operation table.
 */
const unpreparedSsrValue = Symbol('exact.ssr.unprepared');

const generatedSsrOperations: ExactRenderProgramSsrOperations = Object.freeze({
	unprepared: unpreparedSsrValue,
	output: () => [],
	prepareText(invocation, index) {
		const value = unwrap(readRenderProgramSlot(invocation, index));
		return value instanceof Promise || isVNode(value) || Array.isArray(value)
			? unpreparedSsrValue
			: value;
	},
	prepareChild(invocation, index) {
		const value = unwrap(readRenderProgramSlot(invocation, index));
		return value instanceof Promise ? unpreparedSsrValue : value;
	},
	prepareAttribute(invocation, index) {
		const value = unwrap(readRenderProgramSlot(invocation, index));
		return value instanceof Promise ? unpreparedSsrValue : value;
	},
	begin(opaqueContext, nodeCount, slotCount, staticCharacters) {
		const context = opaqueContext as SsrContext;
		// Intrinsic identities are not serialized as cell comments, but their compiler-owned
		// positions still occupy the shared request identity space. Nested generic/component
		// rendering must therefore begin after this finite region so its emitted markers match
		// the client-side ownership graph.
		context.nextId += nodeCount;
		countSsrNodes(context, nodeCount - 1 + slotCount);
		if (staticCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
	},
	static(output, value) {
		if (value !== '') output.push(value);
	},
	text(opaqueContext, output, value, id, characters, markerless) {
		const context = opaqueContext as SsrContext;
		const rendered =
			value === null || value === undefined || value === false || value === true
				? ''
				: escapeText(String(value));
		const html =
			context.markers && !markerless
				? `<!--exact:dynamic:${exactMarkerId(id)}-->${rendered}<!--/exact:dynamic:${exactMarkerId(id)}-->`
				: rendered;
		const nextCharacters = characters + html.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		if (html !== '') output.push(html);
		return nextCharacters;
	},
	child(opaqueContext, output, value, id, characters) {
		const context = opaqueContext as SsrContext;
		const children = normalizeRenderResult(value as Child | Child[]);
		const opening = context.markers ? `<!--exact:dynamic:${exactMarkerId(id)}-->` : '';
		const closing = context.markers ? `<!--/exact:dynamic:${exactMarkerId(id)}-->` : '';
		const nextCharacters = characters + opening.length + closing.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		if (opening) output.push(opening);
		output.push(children);
		if (closing) output.push(closing);
		return nextCharacters;
	},
	keyedChild(output, value) {
		output.push(normalizeRenderResult(value as Child | Child[]));
	},
	attribute(opaqueContext, output, value, name, tag, characters) {
		const context = opaqueContext as SsrContext;
		const html = renderAttrs({ [name]: value }, false, tag, context);
		const nextCharacters = characters + html.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		if (html !== '') output.push(html);
		return nextCharacters;
	}
});

/** Handles a render-program string node while leaving every other vnode untouched. */
export function renderSsrProgramString(
	context: SsrContext,
	vnode: VNode,
	owner: AnyComponentInstance | undefined,
	renderFallback: (fallback: VNode) => string,
	renderChildren: (children: readonly Child[]) => string
): string | undefined {
	if (vnode.type !== RenderProgram) return undefined;
	const planned = renderSsrProgram(context, vnode, owner);
	if (planned.fallback) return renderFallback(planned.fallback);
	if (planned.html !== undefined) return planned.html;
	return boundedJoin(
		context,
		planned.segments!.map((segment) =>
			typeof segment === 'string' ? segment : renderChildren(segment)
		)
	);
}

/** Handles a render-program chunk node without buffering its generic fallback. */
export function renderSsrProgramChunks(
	context: SsrContext,
	vnode: VNode,
	owner: AnyComponentInstance | undefined,
	renderFallback: (fallback: VNode) => Iterable<string>,
	renderChildren: (children: readonly Child[]) => Iterable<string>
): Iterable<string> | undefined {
	if (vnode.type !== RenderProgram) return undefined;
	const planned = renderSsrProgram(context, vnode, owner);
	if (planned.fallback) return renderFallback(planned.fallback);
	return flattenDeferredSegments(planned.segments!, renderChildren);
}

function* flattenDeferredSegments(
	segments: readonly DeferredSsrSegment[],
	renderChildren: (children: readonly Child[]) => Iterable<string>
): Iterable<string> {
	for (const segment of segments) {
		if (typeof segment === 'string') yield segment;
		else yield* renderChildren(segment);
	}
}

/** Re-enters the component owner while a marker-mode fallback allocates reactive VNodes. */
function materializeProgramFallback(vnode: VNode, owner: AnyComponentInstance | undefined): VNode {
	const fallback = withRenderProgramOwner(owner, () => renderProgramFallback(vnode));
	if (!fallback)
		throw new Error('Client-only compiler render programs cannot execute through SSR fallback');
	return fallback;
}
