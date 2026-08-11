import {
	Fragment,
	Target,
	unwrap,
	type ComponentInstance,
	type EnhancementEntry
} from '@exactjs/core';
import type { Mounted } from '../types.js';

/** One mounted semantic target and the logical owner frame that selected it. */
export type EnhancementTarget = {
	readonly mounted: Mounted;
	readonly owner?: Mounted;
	readonly parentInstance?: ComponentInstance<any>;
	readonly depth: number;
};

/** Enhancement entries and declarations grouped onto one mounted semantic target. */
export type TargetEnhancements = {
	readonly target: EnhancementTarget;
	readonly entries: EnhancementEntry[];
	readonly inheritedIdentities: Set<string>;
	readonly boundaries: Map<string, Mounted[]>;
};

type RoutedTarget = EnhancementTarget & { readonly frame: Mounted };

/** Resolves each declaration independently, then groups declarations sharing one bounded target. */
export function collectTargetEnhancements(
	boundary: Mounted,
	parentInstance: ComponentInstance<any> | undefined
): Map<Mounted, TargetEnhancements> {
	const grouped = new Map<Mounted, TargetEnhancements>();
	const orders = new Map<Mounted, Map<string, number>>();
	let order = 0;
	walkMounted(boundary, undefined, parentInstance, 0, (mounted, owner, instance, depth) => {
		for (const entry of mounted.vnode.enhancement?.entries ?? []) {
			if (isRoutingOnlyEntry(entry)) continue;
			const target = resolveEnhancementTarget(mounted, entry.identity, instance, owner, depth);
			if (!target) continue;
			let group = grouped.get(target.mounted);
			if (!group) {
				group = {
					target,
					entries: [],
					inheritedIdentities: new Set(),
					boundaries: new Map()
				};
				grouped.set(target.mounted, group);
			}
			const boundaries = group.boundaries.get(entry.identity) ?? [];
			if (!boundaries.includes(mounted)) boundaries.push(mounted);
			group.boundaries.set(entry.identity, boundaries);
			if (mounted !== target.mounted) group.inheritedIdentities.add(entry.identity);
			mergeEntry(group, orders, entry, order++);
		}
	});
	return grouped;
}

function mergeEntry(
	group: TargetEnhancements,
	groupedOrders: Map<Mounted, Map<string, number>>,
	entry: EnhancementEntry,
	order: number
): void {
	const existing = group.entries.find((candidate) => candidate.identity === entry.identity);
	if (!existing) {
		group.entries.push(entry);
		let values = groupedOrders.get(group.target.mounted);
		if (!values) groupedOrders.set(group.target.mounted, (values = new Map()));
		values.set(entry.identity, order);
		return;
	}
	const index = group.entries.indexOf(existing);
	const values = groupedOrders.get(group.target.mounted)!;
	const existingOrder = values.get(existing.identity)!;
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
	values.set(existing.identity, Math.max(existingOrder, order));
}

/** Resolves direct intrinsic/fragment declarations or one component's bounded first-root frame. */
export function resolveEnhancementTarget(
	boundary: Mounted,
	identity: string,
	parentInstance: ComponentInstance<any> | undefined,
	owner?: Mounted,
	depth = 0
): EnhancementTarget | undefined {
	if (typeof boundary.vnode.type === 'string' || boundary.vnode.type === Fragment)
		return { mounted: boundary, owner, parentInstance, depth };
	const exported = findFirstTargetExport(boundary, owner, parentInstance, depth);
	if (exported) return exported;
	const routed = findRootBearingFrame(boundary, owner, parentInstance, depth);
	if (!routed) return undefined;
	return findExplicitTarget(routed.frame, identity, routed.parentInstance, routed.depth) ?? routed;
}

/** Resolves one `_target` boundary's children without treating the boundary itself as output. */
export function resolveTargetBoundary(
	boundary: Mounted,
	parentInstance: ComponentInstance<any> | undefined,
	dependencies?: Set<Mounted>
): EnhancementTarget | undefined {
	const nested = findFirstTargetExport(boundary, undefined, parentInstance, 0, true, dependencies);
	if (nested) return nested;
	for (const child of boundary.children) {
		const routed = findFirstRoot(child, boundary, parentInstance, 1, boundary, dependencies);
		if (routed) return routed;
	}
	return undefined;
}

function findFirstTargetExport(
	boundary: Mounted,
	owner: Mounted | undefined,
	parentInstance: ComponentInstance<any> | undefined,
	depth: number,
	skipBoundary = false,
	dependencies?: Set<Mounted>
): EnhancementTarget | undefined {
	dependencies?.add(boundary);
	if (!skipBoundary && boundary.vnode.type === Target && boundary.targetBoundary?.selected)
		return locateMountedTarget(
			boundary,
			boundary.targetBoundary.selected,
			owner,
			parentInstance,
			depth,
			dependencies
		);
	const childInstance = boundary.instance ?? parentInstance;
	for (const child of boundary.children) {
		const result = findFirstTargetExport(
			child,
			boundary,
			childInstance,
			depth + 1,
			false,
			dependencies
		);
		if (result) return result;
	}
	return undefined;
}

function locateMountedTarget(
	boundary: Mounted,
	target: Mounted,
	owner: Mounted | undefined,
	parentInstance: ComponentInstance<any> | undefined,
	depth: number,
	dependencies?: Set<Mounted>
): EnhancementTarget | undefined {
	dependencies?.add(boundary);
	if (boundary === target) return { mounted: boundary, owner, parentInstance, depth };
	const childInstance = boundary.instance ?? parentInstance;
	for (const child of boundary.children) {
		const result = locateMountedTarget(
			child,
			target,
			boundary,
			childInstance,
			depth + 1,
			dependencies
		);
		if (result) return result;
	}
	return undefined;
}

function findRootBearingFrame(
	boundary: Mounted,
	owner: Mounted | undefined,
	parentInstance: ComponentInstance<any> | undefined,
	depth: number,
	dependencies?: Set<Mounted>
): RoutedTarget | undefined {
	dependencies?.add(boundary);
	const frame = typeof boundary.vnode.type === 'function' ? boundary : undefined;
	const children = frame ? boundary.children : [boundary];
	const instance = frame?.instance ?? parentInstance;
	for (const child of children) {
		const result = findFirstRoot(
			child,
			frame ?? owner,
			instance,
			depth + (frame ? 1 : 0),
			frame,
			dependencies
		);
		if (result) return result;
	}
	return undefined;
}

function findFirstRoot(
	mounted: Mounted,
	owner: Mounted | undefined,
	parentInstance: ComponentInstance<any> | undefined,
	depth: number,
	frame: Mounted | undefined,
	dependencies?: Set<Mounted>
): RoutedTarget | undefined {
	dependencies?.add(mounted);
	if (mounted.enhancement)
		return findFirstRoot(
			mounted.enhancement.target,
			owner,
			parentInstance,
			depth,
			frame,
			dependencies
		);
	if (typeof mounted.vnode.type === 'string') {
		return { mounted, owner, parentInstance, depth, frame: frame ?? owner ?? mounted };
	}
	if (typeof mounted.vnode.type === 'function')
		return findRootBearingFrame(mounted, owner, parentInstance, depth, dependencies);
	const childInstance = mounted.instance ?? parentInstance;
	for (const child of mounted.children) {
		const result = findFirstRoot(child, mounted, childInstance, depth + 1, frame, dependencies);
		if (result) return result;
	}
	return undefined;
}

function findExplicitTarget(
	frame: Mounted,
	identity: string,
	parentInstance: ComponentInstance<any> | undefined,
	depth: number
): EnhancementTarget | undefined {
	const children = typeof frame.vnode.type === 'function' ? frame.children : [frame];
	for (const child of children) {
		const result = findExplicitInTransparentOutput(
			child,
			frame,
			parentInstance,
			depth + 1,
			identity
		);
		if (result) return result;
	}
	return undefined;
}

function findExplicitInTransparentOutput(
	mounted: Mounted,
	owner: Mounted | undefined,
	parentInstance: ComponentInstance<any> | undefined,
	depth: number,
	identity: string
): EnhancementTarget | undefined {
	if (mounted.enhancement)
		return findExplicitInTransparentOutput(
			mounted.enhancement.target,
			owner,
			parentInstance,
			depth,
			identity
		);
	if (typeof mounted.vnode.type === 'function') return undefined;
	if (typeof mounted.vnode.type === 'string') {
		const selector = mounted.vnode.enhancement?.entries.find(
			(entry) => entry.identity === identity && entry.root !== undefined
		);
		if (selector && unwrap(selector.root)) return { mounted, owner, parentInstance, depth };
	}
	const childInstance = mounted.instance ?? parentInstance;
	for (const child of mounted.children) {
		const result = findExplicitInTransparentOutput(
			child,
			mounted,
			childInstance,
			depth + 1,
			identity
		);
		if (result) return result;
	}
	return undefined;
}

/** Visits every mounted node in physical child order while carrying component ownership. */
export function walkMounted(
	mounted: Mounted,
	owner: Mounted | undefined,
	parentInstance: ComponentInstance<any> | undefined,
	depth: number,
	visit: (
		mounted: Mounted,
		owner: Mounted | undefined,
		parentInstance: ComponentInstance<any> | undefined,
		depth: number
	) => void
): void {
	visit(mounted, owner, parentInstance, depth);
	const childInstance = mounted.instance ?? parentInstance;
	for (const child of mounted.children)
		walkMounted(child, mounted, childInstance, depth + 1, visit);
}

/** Visits authored logical output while bypassing active enhancement wrapper chains. */
export function walkLogicalMounted(
	mounted: Mounted,
	owner: Mounted | undefined,
	parentInstance: ComponentInstance<any> | undefined,
	depth: number,
	visit: (
		mounted: Mounted,
		owner: Mounted | undefined,
		parentInstance: ComponentInstance<any> | undefined,
		depth: number
	) => void
): void {
	if (mounted.enhancement) {
		walkLogicalMounted(mounted.enhancement.target, owner, parentInstance, depth, visit);
		return;
	}
	visit(mounted, owner, parentInstance, depth);
	const childInstance = mounted.instance ?? parentInstance;
	for (const child of mounted.children)
		walkLogicalMounted(child, mounted, childInstance, depth + 1, visit);
}

function isRoutingOnlyEntry(entry: EnhancementEntry): boolean {
	return entry.root !== undefined && Object.keys(entry.props).length === 0;
}
