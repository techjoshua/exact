import {
	type AnyComponentInstance,
	isVNode,
	normalizeRenderResult,
	type VNode
} from '@exactjs/core';
import { unwrap } from '@exactjs/reactive/framework/values';
import { RenderProgram, ServerSlot } from '@exactjs/core/framework/render-structure';
import type { ExactRenderProgramSsrOperations } from '@exactjs/core/framework/render-structure';
import type { ExactPreparedServerRenderProgram } from '@exactjs/core/framework/server-render-structure';
import {
	readRenderProgram,
	readRenderProgramSlot,
	renderProgramFallback,
	type ExactRenderProgramInvocation
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
	return executeSsrProgram(context, invocation, owner);
}

/** Executes a compiler-closed server invocation without constructing or dispatching a VNode. */
export function renderPreparedSsrProgram(
	context: SsrContext,
	invocation: ExactPreparedServerRenderProgram,
	owner?: AnyComponentInstance
): {
	readonly segments?: readonly DeferredSsrSegment[];
	readonly fallback?: VNode;
} {
	if (context.reactMarkup) return { fallback: materializeInvocationFallback(invocation, owner) };
	return executeSsrProgram(context, invocation, owner);
}

function executeSsrProgram(
	context: SsrContext,
	invocation: ExactRenderProgramInvocation,
	owner?: AnyComponentInstance
): { readonly segments?: readonly DeferredSsrSegment[]; readonly fallback?: VNode } {
	const { program } = invocation;
	if (program.ssr) {
		const output = program.ssr(generatedSsrOperations, context, invocation);
		if (!output) return { fallback: materializeInvocationFallback(invocation, owner) };
		return { segments: output as DeferredSsrSegment[] };
	}
	return { fallback: materializeInvocationFallback(invocation, owner) };
}

type DeferredSsrSegment = string | readonly Child[] | VNode;

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
	prepareComponent(invocation, index) {
		const value = unwrap(readRenderProgramSlot(invocation, index));
		return value instanceof Promise ||
			!isVNode(value) ||
			(typeof value.type !== 'function' && value.type !== ServerSlot)
			? unpreparedSsrValue
			: value;
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
	component(opaqueContext, output, value, id, characters, markerless) {
		const context = opaqueContext as SsrContext;
		const opening =
			context.markers && !markerless ? `<!--exact:dynamic:${exactMarkerId(id)}-->` : '';
		const closing =
			context.markers && !markerless ? `<!--/exact:dynamic:${exactMarkerId(id)}-->` : '';
		const nextCharacters = characters + opening.length + closing.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		if (opening) output.push(opening);
		output.push(value as VNode);
		if (closing) output.push(closing);
		return nextCharacters;
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
	renderChildren: (children: readonly Child[]) => string,
	renderOwnedComponent: (component: VNode) => string
): string | undefined {
	if (vnode.type !== RenderProgram) return undefined;
	const planned = renderSsrProgram(context, vnode, owner);
	if (planned.fallback) return renderFallback(planned.fallback);
	if (planned.html !== undefined) return planned.html;
	return boundedJoin(
		context,
		planned.segments!.map((segment) =>
			typeof segment === 'string'
				? segment
				: Array.isArray(segment)
					? renderChildren(segment)
					: renderOwnedComponent(segment as VNode)
		)
	);
}

/** Handles a render-program chunk node without buffering its generic fallback. */
export function renderSsrProgramChunks(
	context: SsrContext,
	vnode: VNode,
	owner: AnyComponentInstance | undefined,
	renderFallback: (fallback: VNode) => Iterable<string>,
	renderChildren: (children: readonly Child[]) => Iterable<string>,
	renderOwnedComponent: (component: VNode) => Iterable<string>
): Iterable<string> | undefined {
	if (vnode.type !== RenderProgram) return undefined;
	const planned = renderSsrProgram(context, vnode, owner);
	if (planned.fallback) return renderFallback(planned.fallback);
	return flattenDeferredSegments(planned.segments!, renderChildren, renderOwnedComponent);
}

/** Serializes one direct compiler-issued server invocation into a bounded string. */
export function renderPreparedSsrProgramString(
	context: SsrContext,
	invocation: ExactPreparedServerRenderProgram,
	owner: AnyComponentInstance | undefined,
	renderFallback: (fallback: VNode) => string,
	renderChildren: (children: readonly Child[]) => string,
	renderOwnedComponent: (component: VNode) => string
): string {
	const planned = renderPreparedSsrProgram(context, invocation, owner);
	if (planned.fallback) return renderFallback(planned.fallback);
	return boundedJoin(
		context,
		planned.segments!.map((segment) =>
			typeof segment === 'string'
				? segment
				: Array.isArray(segment)
					? renderChildren(segment)
					: renderOwnedComponent(segment as VNode)
		)
	);
}

/** Streams one direct compiler-issued server invocation without a RenderProgram VNode. */
export function renderPreparedSsrProgramChunks(
	context: SsrContext,
	invocation: ExactPreparedServerRenderProgram,
	owner: AnyComponentInstance | undefined,
	renderFallback: (fallback: VNode) => Iterable<string>,
	renderChildren: (children: readonly Child[]) => Iterable<string>,
	renderOwnedComponent: (component: VNode) => Iterable<string>
): Iterable<string> {
	const planned = renderPreparedSsrProgram(context, invocation, owner);
	if (planned.fallback) return renderFallback(planned.fallback);
	return flattenDeferredSegments(planned.segments!, renderChildren, renderOwnedComponent);
}

function* flattenDeferredSegments(
	segments: readonly DeferredSsrSegment[],
	renderChildren: (children: readonly Child[]) => Iterable<string>,
	renderOwnedComponent: (component: VNode) => Iterable<string>
): Iterable<string> {
	for (const segment of segments) {
		if (typeof segment === 'string') yield segment;
		else if (Array.isArray(segment)) yield* renderChildren(segment);
		else yield* renderOwnedComponent(segment as VNode);
	}
}

/** Re-enters the component owner while a marker-mode fallback allocates reactive VNodes. */
function materializeProgramFallback(vnode: VNode, owner: AnyComponentInstance | undefined): VNode {
	const fallback = withRenderProgramOwner(owner, () => renderProgramFallback(vnode));
	if (!fallback)
		throw new Error('Client-only compiler render programs cannot execute through SSR fallback');
	return fallback;
}

function materializeInvocationFallback(
	invocation: ExactRenderProgramInvocation,
	owner: AnyComponentInstance | undefined
): VNode {
	const fallback = withRenderProgramOwner(owner, () => invocation.fallback?.());
	if (!fallback)
		throw new Error(
			`Client-only compiler render program ${invocation.program.id} cannot execute through SSR fallback`
		);
	return fallback;
}
