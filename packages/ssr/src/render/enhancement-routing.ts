import {
	Suspense,
	getCellVNode,
	isCellVNode,
	isVNode,
	type ComponentInstance,
	type EnhancementEntry,
	type VNode
} from '@exactjs/core';
import { unwrap } from '@exactjs/reactive';
import type { SsrContext } from '../types.js';
import { chargeEnhancementPlanning } from './enhancement-limits.js';
import { resolveSsrLogicalChildren } from './logical-children.js';

type Declaration = {
	readonly entry: EnhancementEntry;
	readonly order: number;
	fallback?: VNode;
	explicit?: VNode;
};

type TargetGroup = {
	readonly entries: EnhancementEntry[];
	readonly orders: Map<string, number>;
};

/**
 * Resolves every declaration after materialization, then publishes immutable target groups.
 * The traversal mirrors DOM nearest-prop merging and explicit-target precedence.
 */
export function collectSsrEnhancementRoutes(
	context: SsrContext,
	boundary: VNode,
	parent: ComponentInstance<any> | undefined,
	depth: number,
	budget: { nodes: number }
): void {
	const groups = new Map<VNode, TargetGroup>();
	let nextOrder = 0;
	const finalize = (declaration: Declaration) => {
		const target = declaration.explicit ?? declaration.fallback;
		if (!target) return;
		let group = groups.get(target);
		if (!group) {
			group = { entries: [], orders: new Map() };
			groups.set(target, group);
		}
		const existing = group.entries.find((entry) => entry.identity === declaration.entry.identity);
		if (!existing) {
			group.entries.push(declaration.entry);
			group.orders.set(declaration.entry.identity, declaration.order);
			return;
		}
		const index = group.entries.indexOf(existing);
		const existingOrder = group.orders.get(existing.identity)!;
		const declarationIsNearer = declaration.order > existingOrder;
		group.entries[index] = Object.freeze({
			identity: existing.identity,
			props: Object.freeze(
				declarationIsNearer
					? { ...existing.props, ...declaration.entry.props }
					: { ...declaration.entry.props, ...existing.props }
			),
			...(declarationIsNearer
				? declaration.entry.root === undefined
					? {}
					: { root: declaration.entry.root }
				: existing.root === undefined
					? {}
					: { root: existing.root })
		});
		group.orders.set(existing.identity, Math.max(existingOrder, declaration.order));
	};
	const visit = (
		vnode: VNode,
		instance: ComponentInstance<any> | undefined,
		level: number,
		inherited: readonly Declaration[]
	): void => {
		chargeEnhancementPlanning(context, level, budget);
		const local: Declaration[] = (vnode.enhancements?.entries ?? [])
			.filter((entry) => !routingOnlyEntry(entry))
			.map((entry) => ({ entry, order: nextOrder++ }));
		if (local.length) context.plannedEnhancementBoundaries.add(vnode);
		const active = local.length ? [...inherited, ...local] : inherited;
		if (typeof vnode.type === 'string') {
			for (const declaration of active) {
				declaration.fallback ??= vnode;
				if (declaration.explicit) continue;
				const selector = vnode.enhancements?.entries.find(
					(entry) => entry.identity === declaration.entry.identity && entry.root !== undefined
				);
				if (selector && unwrap(selector.root)) declaration.explicit = vnode;
			}
		}
		if (isCellVNode(vnode)) {
			visit(getCellVNode(vnode), instance, level + 1, active);
		} else if (vnode.type === Suspense) {
			const prepared = context.preparedEnhancementSuspense.get(vnode);
			for (const child of prepared?.children ?? []) {
				if (isVNode(child)) visit(child, prepared?.parent ?? instance, level + 1, active);
			}
		} else if (typeof vnode.type === 'function') {
			const prepared = context.preparedEnhancementComponents.get(vnode);
			const childParent = prepared?.failed ? instance : (prepared?.instance ?? instance);
			for (const child of prepared?.children ?? []) {
				if (isVNode(child)) visit(child, childParent, level + 1, active);
			}
		} else {
			for (const child of resolveSsrLogicalChildren(context, vnode)) {
				if (isVNode(child)) visit(child, instance, level + 1, active);
			}
		}
		for (const declaration of local) finalize(declaration);
	};
	visit(boundary, parent, depth, []);
	for (const [target, group] of groups) {
		context.enhancementTargets.set(target, Object.freeze([...group.entries]));
	}
}

function routingOnlyEntry(entry: EnhancementEntry): boolean {
	return entry.root !== undefined && Object.keys(entry.props).length === 0;
}
