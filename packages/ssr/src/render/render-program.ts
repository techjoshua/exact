import {
	type AnyComponentInstance,
	isVNode,
	normalizeRenderResult,
	type VNode
} from '@exactjs/core';
import { unwrap } from '@exactjs/reactive/framework/values';
import { RenderProgram } from '@exactjs/core/framework/render-structure';
import type {
	ExactRenderProgramInvocation,
	ExactRenderProgramSsrTarget
} from '@exactjs/core/framework/render-structure';
import {
	readRenderProgram,
	readRenderProgramSlot,
	renderProgramFallback
} from '@exactjs/core/framework/render-structure';
import { escapeText } from '../html.js';
import { exactMarkerId, renderAttrs } from '../markup.js';
import { appendBoundedHtml, countSsrNodes, SsrOutputLimitError } from './limits.js';
import type { Child, SsrContext } from '../types.js';
import { withRenderProgramOwner } from './render-program-owner-capability.js';

/** Executes the compiler-native scalar subset or selects its lazy generic fallback. */
export function renderSsrProgram(
	context: SsrContext,
	vnode: VNode,
	owner?: AnyComponentInstance,
	renderChildren?: (children: readonly Child[]) => string
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
		const target = new GeneratedSsrTarget(context, invocation, renderChildren);
		program.ssr(target);
		if (!target.prepared) return { fallback: materializeProgramFallback(vnode, owner) };
		return typeof target.output === 'string'
			? { html: target.output }
			: { segments: target.output.segments };
	}
	return { fallback: materializeProgramFallback(vnode, owner) };
}

type DeferredSsrSegment = string | readonly Child[];

/**
 * Supplies serialization mechanics to one compiler-generated server lane.
 *
 * A compiler-emitted preparation prefix reads and validates every slot before later generated
 * calls can mutate the SSR context. This preserves local fallback semantics without making the
 * runtime rediscover component topology from an operation table.
 */
class GeneratedSsrTarget implements ExactRenderProgramSsrTarget {
	output: string | { readonly segments: DeferredSsrSegment[]; staticCharacters: number };
	prepared = true;

	constructor(
		private readonly context: SsrContext,
		private readonly invocation: ExactRenderProgramInvocation,
		private readonly renderChildren?: (children: readonly Child[]) => string
	) {
		this.output = renderChildren ? '' : { segments: [], staticCharacters: 0 };
	}

	prepareText(index: number): unknown {
		if (!this.prepared) return undefined;
		const value = unwrap(readRenderProgramSlot(this.invocation, index));
		if (value instanceof Promise || isVNode(value) || Array.isArray(value)) {
			this.prepared = false;
			return undefined;
		}
		return value;
	}

	prepareChild(index: number): unknown {
		if (!this.prepared) return undefined;
		const value = unwrap(readRenderProgramSlot(this.invocation, index));
		if (value instanceof Promise) {
			this.prepared = false;
			return undefined;
		}
		return value;
	}

	prepareAttribute(index: number): unknown {
		if (!this.prepared) return undefined;
		const value = unwrap(readRenderProgramSlot(this.invocation, index));
		if (value instanceof Promise) {
			this.prepared = false;
			return undefined;
		}
		return value;
	}

	begin(nodeCount: number, slotCount: number): void {
		if (!this.prepared) return;
		// Intrinsic identities are not serialized as cell comments, but their compiler-owned
		// positions still occupy the shared request identity space. Nested generic/component
		// rendering must therefore begin after this finite region so its emitted markers match
		// the client-side ownership graph.
		this.context.nextId += nodeCount;
		countSsrNodes(this.context, nodeCount - 1 + slotCount);
	}

	static(value: string): void {
		if (!this.prepared) return;
		if (typeof this.output === 'string') {
			this.output = appendBoundedHtml(this.context, this.output, value);
			return;
		}
		this.output.staticCharacters += value.length;
		if (this.output.staticCharacters > this.context.maxOutputBytes)
			throw new SsrOutputLimitError(this.context.maxOutputBytes);
		if (value !== '') this.output.segments.push(value);
	}

	text(value: unknown, id: string, markerless?: true): void {
		if (!this.prepared) return;
		const rendered =
			value === null || value === undefined || value === false || value === true
				? ''
				: escapeText(String(value));
		this.static(
			this.context.markers && !markerless
				? `<!--exact:dynamic:${exactMarkerId(id)}-->${rendered}<!--/exact:dynamic:${exactMarkerId(id)}-->`
				: rendered
		);
	}

	child(value: unknown, id: string): void {
		if (!this.prepared) return;
		const children = normalizeRenderResult(value as Child | Child[]);
		if (this.renderChildren) {
			const rendered = this.renderChildren(children);
			this.static(
				this.context.markers
					? `<!--exact:dynamic:${exactMarkerId(id)}-->${rendered}<!--/exact:dynamic:${exactMarkerId(id)}-->`
					: rendered
			);
			return;
		}
		if (this.context.markers) this.static(`<!--exact:dynamic:${exactMarkerId(id)}-->`);
		if (typeof this.output !== 'string') this.output.segments.push(children);
		if (this.context.markers) this.static(`<!--/exact:dynamic:${exactMarkerId(id)}-->`);
	}

	keyedChild(value: unknown): void {
		if (!this.prepared) return;
		const children = normalizeRenderResult(value as Child | Child[]);
		if (this.renderChildren) this.static(this.renderChildren(children));
		else if (typeof this.output !== 'string') this.output.segments.push(children);
	}

	attribute(value: unknown, name: string, tag: string): void {
		if (!this.prepared) return;
		this.static(renderAttrs({ [name]: value }, false, tag, this.context));
	}
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
