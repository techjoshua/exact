import {
	createVNode,
	readExactEnhancementContexts,
	unwrap,
	type ComponentFunction,
	type ComponentInstance,
	type EnhancementEntry,
	type VNode
} from '@exactjs/core';
import {
	createEffectScope,
	scheduleWork,
	transferEffectScope,
	watch,
	type EffectScope
} from '@exactjs/reactive';
import { lastMountedNode, placeMountedBefore } from '../placement.js';
import type { Mounted, Root } from '../types.js';
import { createMarker } from './root-support.js';
import { disposeMounted } from './teardown.js';
import { releaseMountedRange } from './retained-release.js';

type MountOperation = (
	vnode: VNode,
	parentInstance: ComponentInstance<any> | undefined,
	parentScope: EffectScope | undefined,
	parentNode: Node | undefined
) => Mounted;

/** Installs reactive selector reconciliation for one renderer root. */
export function installEnhancementReconciliation(root: Root, mount: MountOperation): void {
	const reconcile = () => {
		if (!root.mounted) return;
		root.mounted = reconcileEnhancementRoutes(root, root.mounted, undefined, undefined, mount);
	};
	root.reconcileEnhancements = () => {
		if (!root.mounted) return;
		scheduleWork(reconcile, 'normal', undefined, root.mounted.scope);
	};
}

type PatchOperation = (
	mounted: Mounted | undefined,
	vnode: VNode,
	parentInstance: ComponentInstance<any> | undefined,
	parentScope: EffectScope | undefined
) => Mounted;

type Target = {
	readonly mounted: Mounted;
	readonly owner?: Mounted;
	readonly parentInstance?: ComponentInstance<any>;
	readonly depth: number;
};

type TargetEnhancements = {
	readonly target: Target;
	readonly entries: EnhancementEntry[];
	readonly inheritedIdentities: Set<string>;
	readonly boundaries: Map<string, Mounted[]>;
};

/** Activates all declarations rooted in one newly mounted logical subtree. */
export function activateEnhancementSubtree(
	root: Root,
	mounted: Mounted,
	parentInstance: ComponentInstance<any> | undefined,
	parentScope: EffectScope | undefined,
	mount: MountOperation
): Mounted {
	if (!root.enhancementCatalog?.size) {
		reportUnavailableDeclarations(root, mounted);
		return mounted;
	}
	const targets = collectTargetEnhancements(root, mounted, parentInstance);
	let result = mounted;
	// Deeper targets are wrapped first so an outer range can safely own an
	// already-enhanced descendant without invalidating its logical owner link.
	for (const group of [...targets.values()].sort(
		(left, right) => right.target.depth - left.target.depth
	)) {
		const active = group.entries.filter((entry) => {
			if (root.enhancementCatalog?.has(entry.identity)) return true;
			reportUnavailable(root, entry.identity);
			return false;
		});
		if (!active.length) continue;
		const wrapper = wrapTarget(
			root,
			group.target,
			active,
			group.inheritedIdentities,
			group.boundaries,
			parentScope,
			mount
		);
		if (group.target.owner) {
			const index = group.target.owner.children.indexOf(group.target.mounted);
			if (index >= 0) group.target.owner.children[index] = wrapper;
		} else if (group.target.mounted === result) {
			result = wrapper;
		}
	}
	return result;
}

/** Patches an active plugin chain while retaining the authored target as its public identity. */
export function patchEnhancementBoundary(
	root: Root,
	mounted: Mounted,
	next: VNode,
	parent: Node,
	parentInstance: ComponentInstance<any> | undefined,
	parentScope: EffectScope | undefined,
	patch: PatchOperation
): Mounted {
	const state = mounted.enhancement!;
	const local = new Map(
		(next.enhancements?.entries ?? []).map((entry) => [entry.identity, entry] as const)
	);
	const entries = state.entries
		.filter((entry) => state.inheritedIdentities.has(entry.identity) || local.has(entry.identity))
		.map((entry) => {
			const override = local.get(entry.identity);
			return override
				? Object.freeze({
						identity: entry.identity,
						props: Object.freeze({ ...entry.props, ...override.props }),
						...(override.root === undefined ? {} : { root: override.root })
					})
				: entry;
		});
	const active = entries.filter((entry) => root.enhancementCatalog?.has(entry.identity));
	if (!active.length)
		return deactivateEnhancementBoundary(
			root,
			parent,
			mounted,
			next,
			parentInstance,
			parentScope,
			patch
		);
	const chain = createPluginChain(root, active, withoutEnhancements(next));
	mounted.children = [patch(mounted.children[0], chain, parentInstance, mounted.scope)];
	mounted.vnode = next;
	state.target.vnode = next;
	mounted.enhancement = {
		entries: active,
		inheritedIdentities: state.inheritedIdentities,
		target: state.target,
		boundaries: state.boundaries
	};
	return mounted;
}

function collectTargetEnhancements(
	root: Root,
	boundary: Mounted,
	parentInstance: ComponentInstance<any> | undefined
): Map<Mounted, TargetEnhancements> {
	const declarations: Array<{
		entry: EnhancementEntry;
		boundary: Mounted;
		parentInstance?: ComponentInstance<any>;
		depth: number;
	}> = [];
	walkMounted(boundary, undefined, parentInstance, 0, (current, _owner, instance, depth) => {
		for (const entry of current.vnode.enhancements?.entries ?? []) {
			if (routingOnlyEntry(entry)) continue;
			declarations.push({ entry, boundary: current, parentInstance: instance, depth });
		}
	});

	const grouped = new Map<Mounted, TargetEnhancements>();
	for (const declaration of declarations) {
		const target = resolveTarget(
			declaration.boundary,
			declaration.entry.identity,
			declaration.parentInstance
		);
		if (!target) continue;
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
		const existing = group.entries.find((entry) => entry.identity === declaration.entry.identity);
		if (existing) {
			const index = group.entries.indexOf(existing);
			group.entries[index] = Object.freeze({
				identity: existing.identity,
				props: Object.freeze({ ...existing.props, ...declaration.entry.props }),
				...(declaration.entry.root === undefined ? {} : { root: declaration.entry.root })
			});
		} else {
			group.entries.push(declaration.entry);
		}
	}
	return grouped;
}

function routingOnlyEntry(entry: EnhancementEntry): boolean {
	return entry.root !== undefined && Object.keys(entry.props).length === 0;
}

function resolveTarget(
	boundary: Mounted,
	identity: string,
	parentInstance: ComponentInstance<any> | undefined
): Target | undefined {
	let first: Target | undefined;
	let explicit: Target | undefined;
	walkLogicalMounted(boundary, undefined, parentInstance, 0, (current, owner, instance, depth) => {
		if (explicit || typeof current.vnode.type !== 'string') return;
		const candidate = { mounted: current, owner, parentInstance: instance, depth };
		first ??= candidate;
		const entry = current.vnode.enhancements?.entries.find((value) => value.identity === identity);
		if (entry && unwrap(entry.root)) explicit = candidate;
	});
	return explicit ?? first;
}

function walkMounted(
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

function walkLogicalMounted(
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

/** Rebuilds only a declaration subtree whose reactive root selector changed target identity. */
export function reconcileEnhancementRoutes(
	root: Root,
	mounted: Mounted,
	parentInstance: ComponentInstance<any> | undefined,
	parentScope: EffectScope | undefined,
	mount: MountOperation
): Mounted {
	if (!root.enhancementCatalog?.size || root.enhancementReconciliationDepth) return mounted;
	root.enhancementReconciliationDepth = 1;
	let result = mounted;
	try {
		for (let attempts = 0; attempts < 32; attempts++) {
			const boundary = findReroutedBoundary(result);
			if (!boundary) return result;
			const enclosing = findEnhancementWrapperForTarget(result, boundary) ?? boundary;
			const location = findMountedLocation(
				result,
				enclosing,
				undefined,
				parentInstance,
				parentScope,
				enclosing.dom.parentNode ?? root.container
			);
			if (!location) return result;
			const clean = unwrapEnhancementSubtree(root, enclosing, location.parentScope);
			const activated = activateEnhancementSubtree(
				root,
				clean,
				location.parentInstance,
				location.parentScope,
				mount
			);
			if (location.owner) {
				const index = location.owner.children.indexOf(enclosing);
				if (index >= 0) location.owner.children[index] = activated;
			} else {
				result = activated;
			}
		}
		throw new Error('Enhancement target routing did not stabilize after 32 rebuilds');
	} finally {
		root.enhancementReconciliationDepth = 0;
	}
}

function findReroutedBoundary(mounted: Mounted): Mounted | undefined {
	if (mounted.enhancement) {
		for (const [identity, boundaries] of mounted.enhancement.boundaries) {
			for (const boundary of boundaries) {
				if (!boundary.scope.active) continue;
				if (resolveTarget(boundary, identity, undefined)?.mounted !== mounted.enhancement.target)
					return boundary;
			}
		}
	}
	for (const child of mounted.children) {
		const boundary = findReroutedBoundary(child);
		if (boundary) return boundary;
	}
	return undefined;
}

function findEnhancementWrapperForTarget(mounted: Mounted, target: Mounted): Mounted | undefined {
	if (mounted.enhancement?.target === target) return mounted;
	for (const child of mounted.children) {
		const wrapper = findEnhancementWrapperForTarget(child, target);
		if (wrapper) return wrapper;
	}
	return undefined;
}

type MountedLocation = {
	readonly owner?: Mounted;
	readonly parentInstance?: ComponentInstance<any>;
	readonly parentScope?: EffectScope;
};

function findMountedLocation(
	mounted: Mounted,
	target: Mounted,
	owner: Mounted | undefined,
	parentInstance: ComponentInstance<any> | undefined,
	parentScope: EffectScope | undefined,
	parentNode: Node
): MountedLocation | undefined {
	if (mounted === target) return { owner, parentInstance, parentScope };
	const childInstance = mounted.instance ?? parentInstance;
	const childParent =
		mounted.portalTarget ??
		(typeof mounted.vnode.type === 'string' ? mounted.dom : (mounted.dom.parentNode ?? parentNode));
	for (const child of mounted.children) {
		const location = findMountedLocation(
			child,
			target,
			mounted,
			childInstance,
			mounted.scope,
			childParent
		);
		if (location) return location;
	}
	return undefined;
}

function unwrapEnhancementSubtree(
	root: Root,
	mounted: Mounted,
	parentScope: EffectScope | undefined
): Mounted {
	if (mounted.enhancement) {
		const target = mounted.enhancement.target;
		if (!target.scope.active || !detachMounted(mounted.children[0], target)) return mounted;
		const parent = mounted.dom.parentNode ?? root.container;
		transferEffectScope(target.scope, parentScope);
		placeMountedBefore(root, parent, target, mounted.dom);
		if (!releaseMountedRange(root, parent, mounted, 'enhancement-target-rerouted'))
			disposeMounted(parent, mounted);
		return unwrapEnhancementSubtree(root, target, parentScope);
	}
	for (let index = 0; index < mounted.children.length; index++) {
		mounted.children[index] = unwrapEnhancementSubtree(
			root,
			mounted.children[index]!,
			mounted.scope
		);
	}
	return mounted;
}

function wrapTarget(
	root: Root,
	target: Target,
	entries: readonly EnhancementEntry[],
	inheritedIdentities: ReadonlySet<string>,
	boundaries: ReadonlyMap<string, readonly Mounted[]>,
	parentScope: EffectScope | undefined,
	mount: MountOperation
): Mounted {
	const scope = createEffectScope(target.owner?.scope ?? parentScope);
	const start = createMarker(root, 'enhancement');
	const end = createMarker(root, 'enhancement-end');
	const wrapper: Mounted = {
		vnode: target.mounted.vnode,
		dom: start,
		end,
		scope,
		children: [],
		enhancement: { entries, inheritedIdentities, target: target.mounted, boundaries }
	};
	installEnhancementRouteWatch(root, boundaries, scope);
	const leaf = withoutEnhancements(target.mounted.vnode);
	const chain = createPluginChain(root, entries, leaf);

	const physicalParent = target.mounted.dom.parentNode ?? document.createDocumentFragment();
	if (!target.mounted.dom.parentNode)
		placeMountedBefore(root, physicalParent, target.mounted, null);
	const afterTarget = lastMountedNode(target.mounted).nextSibling;
	physicalParent.insertBefore(start, target.mounted.dom);
	physicalParent.insertBefore(end, afterTarget);
	const previousParking = root.replacementParking;
	const parking = {
		mounts: new Map<VNode, Array<{ mounted: Mounted; parent: Node }>>([
			[leaf, [{ mounted: target.mounted, parent: physicalParent }]]
		]),
		commits: [] as Array<() => void>
	};
	root.replacementParking = parking;
	let plugin: Mounted;
	try {
		plugin = mount(chain, target.parentInstance, scope, physicalParent);
	} finally {
		root.replacementParking = previousParking;
	}
	for (const commit of parking.commits) commit();
	// Parking patches the authored target with the marker-free plugin child.
	// Retain the authored vnode on the logical target so reactive root routing
	// remains discoverable without exposing the marker to component props or DOM.
	target.mounted.vnode = wrapper.vnode;
	placeMountedBefore(root, physicalParent, plugin, end);
	for (const remaining of parking.mounts.values())
		for (const parked of remaining) disposeMounted(parked.parent, parked.mounted);
	wrapper.children = [plugin];
	return wrapper;
}

/** Tracks selector slots without treating routing-only entries as component declarations. */
function installEnhancementRouteWatch(
	root: Root,
	boundaries: ReadonlyMap<string, readonly Mounted[]>,
	scope: EffectScope
): void {
	let initialized = false;
	watch(
		() => {
			for (const [identity, values] of boundaries) {
				for (const boundary of values) {
					walkLogicalMounted(boundary, undefined, undefined, 0, (current) => {
						for (const entry of current.vnode.enhancements?.entries ?? []) {
							if (entry.identity === identity && entry.root !== undefined) unwrap(entry.root);
						}
					});
				}
			}
			if (initialized) root.reconcileEnhancements?.();
			initialized = true;
		},
		undefined,
		{ scope }
	);
}

function createPluginChain(root: Root, entries: readonly EnhancementEntry[], leaf: VNode): VNode {
	let chain = leaf;
	const ordered = orderEnhancementEntries(root, entries);
	for (let index = ordered.length - 1; index >= 0; index--) {
		const entry = ordered[index]!;
		const component = root.enhancementCatalog!.get(entry.identity)!;
		chain = pluginVNode(component, entry, chain, leaf.domain);
	}
	return chain;
}

function orderEnhancementEntries(
	root: Root,
	entries: readonly EnhancementEntry[]
): EnhancementEntry[] {
	const byIdentity = new Map(entries.map((entry) => [entry.identity, entry] as const));
	const providers = new Map<symbol, string[]>();
	const outgoing = new Map<string, Set<string>>();
	const indegree = new Map<string, number>();
	for (const entry of entries) {
		indegree.set(entry.identity, 0);
		outgoing.set(entry.identity, new Set());
		const component = root.enhancementCatalog!.get(entry.identity)!;
		for (const token of readExactEnhancementContexts(component)?.provides ?? []) {
			const identities = providers.get(token) ?? [];
			identities.push(entry.identity);
			providers.set(token, identities);
		}
	}
	for (const entry of entries) {
		const component = root.enhancementCatalog!.get(entry.identity)!;
		const contract = readExactEnhancementContexts(component);
		const consumed = [...(contract?.requires ?? []), ...(contract?.optionallyConsumes ?? [])];
		for (const token of consumed) {
			for (const provider of providers.get(token) ?? []) {
				if (provider === entry.identity || outgoing.get(provider)!.has(entry.identity)) continue;
				outgoing.get(provider)!.add(entry.identity);
				indegree.set(entry.identity, indegree.get(entry.identity)! + 1);
			}
		}
	}
	const ready = [...indegree]
		.filter(([, count]) => count === 0)
		.map(([identity]) => identity)
		.sort();
	const result: EnhancementEntry[] = [];
	while (ready.length) {
		const identity = ready.shift()!;
		result.push(byIdentity.get(identity)!);
		for (const consumer of [...outgoing.get(identity)!].sort()) {
			const next = indegree.get(consumer)! - 1;
			indegree.set(consumer, next);
			if (next === 0) {
				ready.push(consumer);
				ready.sort();
			}
		}
	}
	if (result.length !== entries.length) {
		const cycle = [...indegree]
			.filter(([, count]) => count > 0)
			.map(([identity]) => identity)
			.sort();
		throw new Error(`Enhancement context ordering cycle: ${cycle.join(', ')}`);
	}
	return result;
}

function deactivateEnhancementBoundary(
	root: Root,
	parent: Node,
	mounted: Mounted,
	next: VNode,
	parentInstance: ComponentInstance<any> | undefined,
	parentScope: EffectScope | undefined,
	patch: PatchOperation
): Mounted {
	const target = mounted.enhancement!.target;
	if (target.scope.active && detachMounted(mounted.children[0], target)) {
		transferEffectScope(target.scope, parentScope);
		placeMountedBefore(root, parent, target, mounted.dom);
		disposeMounted(parent, mounted);
		return patch(target, withoutEnhancements(next), parentInstance, parentScope);
	}
	const replacement = patch(undefined, withoutEnhancements(next), parentInstance, parentScope);
	placeMountedBefore(root, parent, replacement, mounted.dom);
	disposeMounted(parent, mounted);
	return replacement;
}

function detachMounted(owner: Mounted | undefined, target: Mounted): boolean {
	if (!owner) return false;
	const index = owner.children.indexOf(target);
	if (index >= 0) {
		owner.children.splice(index, 1);
		return true;
	}
	for (const child of owner.children) if (detachMounted(child, target)) return true;
	return false;
}

function pluginVNode(
	component: ComponentFunction<any, Record<string, unknown>>,
	entry: EnhancementEntry,
	child: VNode,
	domain: VNode['domain']
): VNode {
	const vnode = createVNode(component, { ...entry.props }, child);
	return domain ? { ...vnode, domain } : vnode;
}

function withoutEnhancements(vnode: VNode): VNode {
	if (!vnode.enhancements) return vnode;
	const { enhancements: _enhancements, ...plain } = vnode;
	return plain;
}

function reportUnavailableDeclarations(root: Root, mounted: Mounted): void {
	walkMounted(mounted, undefined, undefined, 0, (current) => {
		for (const entry of current.vnode.enhancements?.entries ?? [])
			reportUnavailable(root, entry.identity);
	});
}

function reportUnavailable(root: Root, identity: string): void {
	root.unavailableEnhancements ??= new Set();
	if (root.unavailableEnhancements.has(identity)) return;
	root.unavailableEnhancements.add(identity);
	root.logger?.log({
		level: 'warn',
		message: `Optional renderer enhancement "${identity}" is unavailable`,
		scope: { source: 'framework', packageName: '@exactjs/dom', category: 'enhancement' }
	});
}
