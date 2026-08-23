import {
	type AnyComponentInstance,
	isVNode,
	normalizeRenderResult,
	unwrap,
	withComponentDomain,
	type VNode
} from '@exactjs/core';
import { RenderProgram } from '@exactjs/core/runtime/render';
import type {
	ExactRenderProgramInvocation,
	ExactRenderProgramSsrTarget
} from '@exactjs/core/runtime/render';
import {
	readRenderProgram,
	readRenderProgramSlot,
	renderProgramFallback
} from '@exactjs/core/runtime/render';
import { withEffectScope } from '@exactjs/reactive';
import { escapeText } from '../html.js';
import { exactMarkerId, renderAttrs } from '../markup.js';
import { appendBoundedHtml, countSsrNodes } from './limits.js';
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
	if (program.ssr) {
		const target = new GeneratedSsrTarget(context, invocation, renderChildren);
		program.ssr(target);
		if (!target.prepared) return { fallback: materializeProgramFallback(vnode, owner) };
		return { html: target.html };
	}
	return { fallback: materializeProgramFallback(vnode, owner) };
}

/**
 * Supplies serialization mechanics to one compiler-generated server lane.
 *
 * A compiler-emitted preparation prefix reads and validates every slot before later generated
 * calls can mutate the SSR context. This preserves local fallback semantics without making the
 * runtime rediscover component topology from an operation table.
 */
class GeneratedSsrTarget implements ExactRenderProgramSsrTarget {
	readonly #values: unknown[] = [];
	prepared = true;
	html = '';

	constructor(
		private readonly context: SsrContext,
		private readonly invocation: ExactRenderProgramInvocation,
		private readonly renderChildren?: (children: readonly Child[]) => string
	) {}

	prepareText(index: number): void {
		if (!this.prepared) return;
		const value = unwrap(readRenderProgramSlot(this.invocation, index));
		if (value instanceof Promise || isVNode(value) || Array.isArray(value)) {
			this.prepared = false;
			return;
		}
		this.#values[index] = value;
	}

	prepareChild(index: number): void {
		if (!this.prepared) return;
		const value = unwrap(readRenderProgramSlot(this.invocation, index));
		if (value instanceof Promise || !this.renderChildren) {
			this.prepared = false;
			return;
		}
		this.#values[index] = value;
	}

	prepareAttribute(index: number): void {
		if (!this.prepared) return;
		const value = unwrap(readRenderProgramSlot(this.invocation, index));
		if (value instanceof Promise) {
			this.prepared = false;
			return;
		}
		this.#values[index] = value;
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
		if (this.prepared) this.html = appendBoundedHtml(this.context, this.html, value);
	}

	text(index: number, id: string, markerless?: true): void {
		if (!this.prepared) return;
		const value = this.#values[index];
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

	child(index: number, id: string): void {
		if (!this.prepared) return;
		const rendered = this.renderChildren!(
			normalizeRenderResult(this.#values[index] as Child | Child[])
		);
		this.static(
			this.context.markers
				? `<!--exact:dynamic:${exactMarkerId(id)}-->${rendered}<!--/exact:dynamic:${exactMarkerId(id)}-->`
				: rendered
		);
	}

	keyedChild(index: number): void {
		if (!this.prepared) return;
		this.static(
			this.renderChildren!(normalizeRenderResult(this.#values[index] as Child | Child[]))
		);
	}

	attribute(index: number, name: string, tag: string): void {
		if (!this.prepared) return;
		this.static(renderAttrs({ [name]: this.#values[index] }, false, tag, this.context));
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
