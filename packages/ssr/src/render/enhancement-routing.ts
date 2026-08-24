import {
	type AnyComponentInstance,
	Fragment,
	Suspense,
	Target,
	isVNode,
	type EnhancementEntry,
	type VNode
} from '@exactjs/core';
import { getCellVNode, isCellVNode } from '@exactjs/core/framework/render-structure';
import { unwrap } from '@exactjs/reactive/framework/values';
import type { SsrContext } from '../types.js';
import { chargeEnhancementPlanning } from './enhancement-limits.js';
import { resolveSsrLogicalChildren } from './logical-children.js';

type TargetGroup = { readonly entries: EnhancementEntry[]; readonly orders: Map<string, number> };
type RoutedTarget = { readonly target: VNode; readonly frame: VNode };

/** Resolves declarations through the same direct-host and bounded component-frame rules as DOM. */
export function collectSsrEnhancementRoutes(
	context: SsrContext,
	boundary: VNode,
	parent: AnyComponentInstance | undefined,
	depth: number,
	budget: { nodes: number }
): void {
	const groups = new Map<VNode, TargetGroup>();
	let order = 0;
	visitTree(context, boundary, parent, depth, budget, (vnode, instance) => {
		for (const entry of vnode.enhancement?.entries ?? []) {
			if (routingOnlyEntry(entry)) continue;
			const routed = resolveSsrEnhancementTarget(context, vnode, instance, entry.identity);
			if (!routed) continue;
			let group = groups.get(routed.target);
			if (!group) {
				group = { entries: [], orders: new Map() };
				groups.set(routed.target, group);
			}
			mergeEntry(group, entry, order++);
			context.plannedEnhancementBoundaries.add(vnode);
		}
	});
	for (const [target, group] of groups)
		context.enhancementTargets.set(target, Object.freeze([...group.entries]));
}

function mergeEntry(group: TargetGroup, entry: EnhancementEntry, order: number): void {
	const existing = group.entries.find((candidate) => candidate.identity === entry.identity);
	if (!existing) {
		group.entries.push(entry);
		group.orders.set(entry.identity, order);
		return;
	}
	const index = group.entries.indexOf(existing);
	const existingOrder = group.orders.get(existing.identity)!;
	const nearer = order > existingOrder;
	group.entries[index] = Object.freeze({
		identity: existing.identity,
		props: Object.freeze(
			nearer ? { ...existing.props, ...entry.props } : { ...entry.props, ...existing.props }
		),
		...(nearer
			? entry.root === undefined
				? {}
				: { root: entry.root }
			: existing.root === undefined
				? {}
				: { root: existing.root })
	});
	group.orders.set(existing.identity, Math.max(existingOrder, order));
}

function resolveSsrEnhancementTarget(
	context: SsrContext,
	boundary: VNode,
	parent: AnyComponentInstance | undefined,
	identity: string
): RoutedTarget | undefined {
	const vnode = isCellVNode(boundary) ? getCellVNode(boundary) : boundary;
	if (typeof vnode.type === 'string' || vnode.type === Fragment)
		return { target: vnode, frame: vnode };
	const exported = findFirstTargetExport(context, vnode, parent);
	if (exported) return { target: exported, frame: vnode };
	const routed = findRootBearingFrame(context, vnode, parent);
	if (!routed) return undefined;
	return {
		target: findExplicitTarget(context, routed.frame, identity) ?? routed.target,
		frame: routed.frame
	};
}

/** Resolves an ordinary `_target` boundary's semantic intrinsic from prepared logical output. */
export function resolveSsrTargetBoundary(
	context: SsrContext,
	boundary: VNode,
	parent: AnyComponentInstance | undefined
): VNode | undefined {
	for (const child of plannedChildren(context, boundary, parent)) {
		if (!isVNode(child)) continue;
		const target = findTargetBoundaryChild(context, child, parent);
		if (target) return target;
	}
	return undefined;
}

function findTargetBoundaryChild(
	context: SsrContext,
	child: VNode,
	parent: AnyComponentInstance | undefined
): VNode | undefined {
	const vnode = isCellVNode(child) ? getCellVNode(child) : child;
	if (typeof vnode.type === 'string') return vnode;
	if (vnode.type === Target) return resolveSsrTargetBoundary(context, vnode, parent);
	if (typeof vnode.type === 'function')
		return (
			findFirstTargetExport(context, vnode, parent) ??
			findRootBearingFrame(context, vnode, parent)?.target
		);
	for (const nested of plannedChildren(context, vnode, parent)) {
		if (!isVNode(nested)) continue;
		const target = findTargetBoundaryChild(context, nested, parent);
		if (target) return target;
	}
	return undefined;
}

function findFirstTargetExport(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	skipBoundary = false
): VNode | undefined {
	if (isCellVNode(vnode)) return findFirstTargetExport(context, getCellVNode(vnode), parent);
	if (!skipBoundary && vnode.type === Target)
		return resolveSsrTargetBoundary(context, vnode, parent);
	let childParent = parent;
	if (typeof vnode.type === 'function') {
		const prepared = context.preparedEnhancementComponents.get(vnode);
		childParent = prepared?.failed ? parent : (prepared?.instance ?? parent);
	}
	for (const child of plannedChildren(context, vnode, childParent)) {
		if (!isVNode(child)) continue;
		const target = findFirstTargetExport(context, child, childParent);
		if (target) return target;
	}
	return undefined;
}

function findRootBearingFrame(
	context: SsrContext,
	boundary: VNode,
	parent: AnyComponentInstance | undefined
): RoutedTarget | undefined {
	const prepared =
		typeof boundary.type === 'function'
			? context.preparedEnhancementComponents.get(boundary)
			: undefined;
	const frame = typeof boundary.type === 'function' ? boundary : undefined;
	const instance = prepared?.failed ? parent : (prepared?.instance ?? parent);
	const children = frame ? (prepared?.children ?? []) : [boundary];
	for (const child of children) {
		if (!isVNode(child)) continue;
		const routed = findFirstRoot(context, child, instance, frame);
		if (routed) return routed;
	}
	return undefined;
}

function findFirstRoot(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	frame: VNode | undefined
): RoutedTarget | undefined {
	if (isCellVNode(vnode)) return findFirstRoot(context, getCellVNode(vnode), parent, frame);
	if (typeof vnode.type === 'string') return { target: vnode, frame: frame ?? vnode };
	if (typeof vnode.type === 'function') return findRootBearingFrame(context, vnode, parent);
	for (const child of plannedChildren(context, vnode, parent)) {
		if (!isVNode(child)) continue;
		const routed = findFirstRoot(context, child, parent, frame);
		if (routed) return routed;
	}
	return undefined;
}

function findExplicitTarget(
	context: SsrContext,
	frame: VNode,
	identity: string
): VNode | undefined {
	const prepared =
		typeof frame.type === 'function' ? context.preparedEnhancementComponents.get(frame) : undefined;
	const children = typeof frame.type === 'function' ? (prepared?.children ?? []) : [frame];
	for (const child of children) {
		if (!isVNode(child)) continue;
		const target = findExplicitInTransparentOutput(context, child, identity);
		if (target) return target;
	}
	return undefined;
}

function findExplicitInTransparentOutput(
	context: SsrContext,
	vnode: VNode,
	identity: string
): VNode | undefined {
	if (isCellVNode(vnode))
		return findExplicitInTransparentOutput(context, getCellVNode(vnode), identity);
	if (typeof vnode.type === 'function') return undefined;
	if (typeof vnode.type === 'string') {
		const selector = vnode.enhancement?.entries.find(
			(entry) => entry.identity === identity && entry.root !== undefined
		);
		if (selector && unwrap(selector.root)) return vnode;
	}
	for (const child of resolveSsrLogicalChildren(context, vnode)) {
		if (!isVNode(child)) continue;
		const target = findExplicitInTransparentOutput(context, child, identity);
		if (target) return target;
	}
	return undefined;
}

function plannedChildren(
	context: SsrContext,
	vnode: VNode,
	_parent: AnyComponentInstance | undefined
): readonly unknown[] {
	if (vnode.type === Suspense)
		return context.preparedEnhancementSuspense.get(vnode)?.children ?? [];
	if (typeof vnode.type === 'function')
		return context.preparedEnhancementComponents.get(vnode)?.children ?? [];
	return resolveSsrLogicalChildren(context, vnode);
}

function visitTree(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	depth: number,
	budget: { nodes: number },
	visit: (vnode: VNode, parent: AnyComponentInstance | undefined) => void
): void {
	chargeEnhancementPlanning(context, depth, budget);
	visit(vnode, parent);
	if (isCellVNode(vnode)) {
		visitTree(context, getCellVNode(vnode), parent, depth + 1, budget, visit);
		return;
	}
	let childParent = parent;
	if (typeof vnode.type === 'function') {
		const prepared = context.preparedEnhancementComponents.get(vnode);
		childParent = prepared?.failed ? parent : (prepared?.instance ?? parent);
	}
	for (const child of plannedChildren(context, vnode, childParent))
		if (isVNode(child)) visitTree(context, child, childParent, depth + 1, budget, visit);
}

function routingOnlyEntry(entry: EnhancementEntry): boolean {
	return entry.root !== undefined && Object.keys(entry.props).length === 0;
}
