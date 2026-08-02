import { unwrap, type ComponentInstance, type EnhancementEntry } from '@exactjs/core';
import type { Mounted } from '../types.js';

export type EnhancementTarget = {
	readonly mounted: Mounted;
	readonly owner?: Mounted;
	readonly parentInstance?: ComponentInstance<any>;
	readonly depth: number;
};

export type TargetEnhancements = {
	readonly target: EnhancementTarget;
	readonly entries: EnhancementEntry[];
	readonly inheritedIdentities: Set<string>;
	readonly boundaries: Map<string, Mounted[]>;
};

type Declaration = {
	entry: EnhancementEntry;
	boundary: Mounted;
	order: number;
	fallback?: EnhancementTarget;
	explicit?: EnhancementTarget;
};

/** Groups inherited declarations by the logical element selected as their target. */
export function collectTargetEnhancements(
	boundary: Mounted,
	parentInstance: ComponentInstance<any> | undefined
): Map<Mounted, TargetEnhancements> {
	const grouped = new Map<Mounted, TargetEnhancements>();
	const groupedOrders = new Map<Mounted, Map<string, number>>();
	let nextOrder = 0;
	const finalize = (declaration: Declaration) => {
		const target = declaration.explicit ?? declaration.fallback;
		if (!target) return;
		let group = grouped.get(target.mounted);
		if (!group) {
			group = { target, entries: [], inheritedIdentities: new Set(), boundaries: new Map() };
			grouped.set(target.mounted, group);
		}
		const boundaries = group.boundaries.get(declaration.entry.identity) ?? [];
		if (!boundaries.includes(declaration.boundary)) boundaries.push(declaration.boundary);
		group.boundaries.set(declaration.entry.identity, boundaries);
		if (declaration.boundary !== target.mounted)
			group.inheritedIdentities.add(declaration.entry.identity);
		mergeDeclaration(groupedOrders, group, declaration);
	};
	const visit = (
		current: Mounted,
		owner: Mounted | undefined,
		instance: ComponentInstance<any> | undefined,
		depth: number,
		inherited: readonly Declaration[]
	): void => {
		if (current.enhancement) {
			visit(current.enhancement.target, owner, instance, depth, inherited);
			return;
		}
		const local: Declaration[] = (current.vnode.enhancements?.entries ?? [])
			.filter((entry) => !isRoutingOnlyEntry(entry))
			.map((entry) => ({ entry, boundary: current, order: nextOrder++ }));
		const active = local.length ? [...inherited, ...local] : inherited;
		if (typeof current.vnode.type === 'string') {
			const candidate = { mounted: current, owner, parentInstance: instance, depth };
			for (const declaration of active) {
				declaration.fallback ??= candidate;
				if (declaration.explicit) continue;
				const selector = current.vnode.enhancements?.entries.find(
					(entry) => entry.identity === declaration.entry.identity
				);
				if (selector?.root !== undefined && unwrap(selector.root)) declaration.explicit = candidate;
			}
		}
		const childInstance = current.instance ?? instance;
		for (const child of current.children) visit(child, current, childInstance, depth + 1, active);
		for (const declaration of local) finalize(declaration);
	};
	visit(boundary, undefined, parentInstance, 0, []);
	return grouped;
}

function mergeDeclaration(
	groupedOrders: Map<Mounted, Map<string, number>>,
	group: TargetEnhancements,
	declaration: Declaration
): void {
	const existing = group.entries.find((entry) => entry.identity === declaration.entry.identity);
	if (!existing) {
		group.entries.push(declaration.entry);
		let orders = groupedOrders.get(group.target.mounted);
		if (!orders) groupedOrders.set(group.target.mounted, (orders = new Map()));
		orders.set(declaration.entry.identity, declaration.order);
		return;
	}
	const index = group.entries.indexOf(existing);
	const orders = groupedOrders.get(group.target.mounted)!;
	const existingOrder = orders.get(existing.identity)!;
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
	orders.set(existing.identity, Math.max(existingOrder, declaration.order));
}

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

export function resolveEnhancementTarget(
	boundary: Mounted,
	identity: string,
	parentInstance: ComponentInstance<any> | undefined
): EnhancementTarget | undefined {
	let first: EnhancementTarget | undefined;
	let explicit: EnhancementTarget | undefined;
	walkLogicalMounted(boundary, undefined, parentInstance, 0, (current, owner, instance, depth) => {
		if (explicit || typeof current.vnode.type !== 'string') return;
		const candidate = { mounted: current, owner, parentInstance: instance, depth };
		first ??= candidate;
		const entry = current.vnode.enhancements?.entries.find((value) => value.identity === identity);
		if (entry && unwrap(entry.root)) explicit = candidate;
	});
	return explicit ?? first;
}

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
