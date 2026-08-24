import {
	Activity,
	Dynamic,
	Fragment,
	Text,
	UnsafeHtml,
	normalizeActivityMode,
	normalizeRenderResult,
	type Child,
	type VNode
} from '@exactjs/core';
import { ServerSlot } from '@exactjs/core/framework/render-structure';
import { unwrap } from '@exactjs/reactive/framework/values';
import type { SsrContext } from '../types.js';
import { registerDynamicComponentPreload } from './resource-hints.js';

/** Finite Fragment children and whether each child owns an authored list marker. */
export type SsrFragmentChildren = Readonly<{
	children: readonly Child[];
	list: boolean;
}>;

/** Resolves the Activity snapshot shared by enhancement planning and final rendering. */
export function resolveSsrActivityChildren(
	context: SsrContext,
	vnode: VNode,
	cache = false
): readonly Child[] {
	const prepared = context.preparedEnhancementChildren?.get(vnode);
	if (prepared) return prepared;
	const children =
		normalizeActivityMode(unwrap(vnode.props.mode)) === 'active' ? vnode.children : [];
	if (cache) (context.preparedEnhancementChildren ??= new WeakMap()).set(vnode, children);
	return children;
}

/** Resolves one Dynamic snapshot and optionally retains its exact VNode identities. */
export function resolveSsrDynamicChildren(
	context: SsrContext,
	vnode: VNode,
	cache = false
): readonly Child[] {
	// Open dynamic components are client-only. Reading their value would run the
	// resolver during SSR and could turn a browser-observed module into server authority.
	if (vnode.props.__exactDynamicComponent) {
		registerDynamicComponentPreload(
			context,
			(vnode.props.__exactDynamicComponent as { id?: string }).id ?? ''
		);
		return [];
	}
	const prepared = context.preparedEnhancementChildren?.get(vnode);
	if (prepared) return prepared;
	const children = normalizeRenderResult(unwrap(vnode.props.value) as Child | Child[]);
	if (cache) (context.preparedEnhancementChildren ??= new WeakMap()).set(vnode, children);
	return children;
}

/** Resolves ordinary or keyed Fragment children without evaluating a planned list twice. */
export function resolveSsrFragmentChildren(
	context: SsrContext,
	vnode: VNode,
	cache = false
): SsrFragmentChildren {
	const list = vnode.props.list as
		| {
				collection: Iterable<unknown>;
				source?: { get(): Iterable<unknown> };
				key(item: unknown): string;
				render(item: unknown): VNode;
		  }
		| undefined;
	if (!list) return { children: vnode.children, list: false };
	const prepared = context.preparedEnhancementChildren?.get(vnode);
	if (prepared) return { children: prepared, list: true };
	const collection = list.source ? list.source.get() : list.collection;
	const children = [...collection].map((item) => {
		const child = list.render(item);
		return { ...child, key: String(list.key(item)) };
	});
	if (cache) (context.preparedEnhancementChildren ??= new WeakMap()).set(vnode, children);
	return { children, list: true };
}

/** Resolves finite logical children during enhancement target materialization. */
export function resolveSsrLogicalChildren(context: SsrContext, vnode: VNode): readonly Child[] {
	if (vnode.type === Dynamic) return resolveSsrDynamicChildren(context, vnode, true);
	if (vnode.type === Fragment) return resolveSsrFragmentChildren(context, vnode, true).children;
	if (vnode.type === Activity) return resolveSsrActivityChildren(context, vnode, true);
	if (vnode.type === ServerSlot || vnode.type === Text || vnode.type === UnsafeHtml) return [];
	return vnode.children;
}
