import { readEnhancementBinding } from './enhancement-bindings.js';
import { type AnyComponentInstance, unwrap, type EnhancementEntry } from '@exactjs/core';
import type { Mounted, Root } from '../types.js';
import { watch } from '@exactjs/reactive/framework/runtime';
import {
	findRootBearingFrame,
	isMountedSemanticIntrinsic,
	type MountedTarget
} from './target-routing.js';
import { mountedAuthoredOperation, mountedEnhancementEntries } from './enhancement-chain.js';

/** One mounted semantic target and the logical owner frame that selected it. */
export type EnhancementTarget = MountedTarget;

/** Enhancement entries and declarations grouped onto one mounted semantic target. */
export type TargetEnhancements = {
	readonly target: EnhancementTarget;
	readonly entries: EnhancementEntry[];
	readonly inheritedIdentities: Set<string>;
	readonly boundaries: Map<string, Mounted[]>;
};

/** Resolves each declaration independently, then groups declarations sharing one bounded target. */
export function collectTargetEnhancements(
	root: Root,
	boundary: Mounted,
	parentInstance: AnyComponentInstance | undefined
): Map<Mounted, TargetEnhancements> {
	const grouped = new Map<Mounted, TargetEnhancements>();
	const active = new Map<Mounted, Set<string>>();
	walkMounted(boundary, undefined, parentInstance, 0, (mounted) => {
		if (mounted.enhancement)
			active.set(
				mounted.enhancement.target,
				new Set(mounted.enhancement.entries.map((entry) => entry.identity))
			);
	});
	const orders = new Map<Mounted, Map<string, number>>();
	let order = 0;
	walkMounted(boundary, undefined, parentInstance, 0, (mounted, owner, instance, depth) => {
		if (mounted.enhancement) return;
		for (const entry of mountedEnhancementEntries(mounted)) {
			if (isRoutingOnlyEntry(entry)) continue;
			const target = resolveEnhancementTarget(mounted, entry.identity, instance, owner, depth);
			if (!target) {
				watchDormantTarget(root, mounted, entry.identity, instance, owner, depth);
				continue;
			}
			mounted.dormantEnhancementWatches?.get(entry.identity)?.();
			mounted.dormantEnhancementWatches?.delete(entry.identity);
			if (active.get(target.mounted)?.has(entry.identity)) continue;
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
		...((nearer ? entry : existing).intrinsicFragment === undefined
			? {}
			: { intrinsicFragment: (nearer ? entry : existing).intrinsicFragment }),
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
	parentInstance: AnyComponentInstance | undefined,
	owner?: Mounted,
	depth = 0
): EnhancementTarget | undefined {
	if (isMountedSemanticIntrinsic(boundary) || boundary.fragmentReceipt !== undefined)
		return { mounted: boundary, owner, parentInstance, depth };
	// A compiler-closed intrinsic with no structural target slots has only one possible
	// destination. Structural replacement still enters normal reconciliation; scalar props
	// cannot change this selection, so no reactive route record is needed for this frame.
	if (boundary.clientArtifact && boundary.children.length === 1) {
		let child = boundary.children[0]!;
		while (child.enhancement) child = child.enhancement.target;
		if (
			child.renderProgram &&
			!child.renderProgram.invocation.program.targetSlots?.length &&
			isMountedSemanticIntrinsic(child)
		)
			return {
				mounted: child,
				owner: boundary,
				parentInstance: boundary.instance ?? parentInstance,
				depth: depth + 1
			};
	}
	return readEnhancementBinding(boundary, identity, (dependencies) =>
		resolveComponentTarget(boundary, identity, parentInstance, owner, depth, dependencies)
	);
}

function resolveComponentTarget(
	boundary: Mounted,
	identity: string,
	parentInstance: AnyComponentInstance | undefined,
	owner: Mounted | undefined,
	depth: number,
	dependencies: Set<Mounted>
): EnhancementTarget | undefined {
	dependencies.add(boundary);
	const explicit = findExplicitTarget(boundary, identity, parentInstance, depth, dependencies);
	if (explicit.active) return explicit.target;
	const routed = findRootBearingFrame(boundary, owner, parentInstance, depth, dependencies);
	if (!routed) return undefined;
	if (routed.frame !== boundary && routed.frame.clientArtifact)
		return resolveEnhancementTarget(
			routed.frame,
			identity,
			routed.parentInstance,
			routed.owner,
			routed.depth
		);
	return routed;
}

type ExplicitSelection = { active: boolean; target?: EnhancementTarget };

/** Reads only this component's authored frame; marked child invocations delegate explicitly. */
function findExplicitTarget(
	frame: Mounted,
	identity: string,
	parentInstance: AnyComponentInstance | undefined,
	depth: number,
	dependencies: Set<Mounted>
): ExplicitSelection {
	let selected: ExplicitSelection = { active: false };
	const supplied = frame.componentReceipt?.children.length
		? frame.componentReceipt.children
		: frame.componentReceipt?.props.children;
	const projected = new Set(
		Array.isArray(supplied) ? supplied : supplied === undefined ? [] : [supplied]
	);
	const visit = (
		mounted: Mounted,
		owner: Mounted,
		instance: AnyComponentInstance | undefined,
		level: number,
		entries = mountedEnhancementEntries(mounted),
		structured = false
	): void => {
		dependencies.add(mounted);
		if (
			structured &&
			mounted.operation !== undefined &&
			projected.has(mountedAuthoredOperation(mounted))
		)
			return;
		if (mounted.enhancement) {
			visit(mounted.enhancement.target, owner, instance, level, entries, structured);
			return;
		}
		const selector = entries.find(
			(entry) => entry.identity === identity && entry.root !== undefined
		);
		if (selector && unwrap(selector.root)) {
			if (selected.active) throw new Error(`Multiple active enhancement roots for ${identity}`);
			selected = {
				active: true,
				target: mounted.clientArtifact
					? resolveEnhancementTarget(mounted, identity, instance, owner, level)
					: { mounted, owner, parentInstance: instance, depth: level }
			};
		}
		if (mounted.clientArtifact) return;
		for (const child of mounted.children)
			visit(
				child,
				mounted,
				mounted.instance ?? instance,
				level + 1,
				undefined,
				structured || isMountedSemanticIntrinsic(mounted) || mounted.fragmentReceipt !== undefined
			);
	};
	const instance = frame.instance ?? parentInstance;
	for (const child of frame.children) visit(child, frame, instance, depth + 1);
	return selected;
}

/** Visits every mounted node in physical child order while carrying component ownership. */
export function walkMounted(
	mounted: Mounted,
	owner: Mounted | undefined,
	parentInstance: AnyComponentInstance | undefined,
	depth: number,
	visit: (
		mounted: Mounted,
		owner: Mounted | undefined,
		parentInstance: AnyComponentInstance | undefined,
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
	parentInstance: AnyComponentInstance | undefined,
	depth: number,
	visit: (
		mounted: Mounted,
		owner: Mounted | undefined,
		parentInstance: AnyComponentInstance | undefined,
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

/** Retains selector observation while an explicit component root has no physical output. */
function watchDormantTarget(
	root: Root,
	boundary: Mounted,
	identity: string,
	parent: AnyComponentInstance | undefined,
	owner: Mounted | undefined,
	depth: number
): void {
	const watches = (boundary.dormantEnhancementWatches ??= new Map());
	if (watches.has(identity)) return;
	let initialized = false;
	const stop = watch(
		() => {
			resolveEnhancementTarget(boundary, identity, parent, owner, depth);
			if (initialized) root.reconcileEnhancements?.();
			initialized = true;
		},
		undefined,
		{ scope: boundary.scope }
	);
	watches.set(identity, stop);
}
