import { removeReroutedEnhancementPeer } from './enhancement-peer-removal.js';
import { installEnhancementRouteWatch } from './enhancement-route-watch.js';
import { findMountedLocation, detachMounted } from './enhancement-location.js';
import { type AnyComponentInstance, type Child, type EnhancementEntry } from '@exactjs/core';
import { readExactEnhancementContexts } from '@exactjs/core';
import { readCompiledFragmentReceipt } from '@exactjs/core/runtime/component-operations';
import { mountPreparedFragmentEnhancements } from './prepared-fragment-enhancements.js';
import {
	createEffectScope,
	scheduleWork,
	transferEffectScope,
	type EffectScope
} from '@exactjs/reactive/framework/runtime';
import { lastMountedNode, placeMountedBefore } from '../placement.js';
import type { Mounted, Root } from '../types.js';
import { createMarker } from './root-support.js';
import { disposeMounted } from './teardown.js';
import { releaseMountedRange } from './retained-release.js';
import {
	childEnhancementEntries,
	createEnhancementChain,
	mountedAuthoredOperation,
	mountedEnhancementKey,
	restoreMountedAuthoredOperation,
	withoutEnhancements
} from './enhancement-chain.js';
import {
	hasActiveEnhancement,
	reportUnavailableEnhancement,
	reportUnavailableEnhancementDeclarations
} from './enhancement-availability.js';
import {
	collectTargetEnhancements,
	resolveEnhancementTarget,
	type EnhancementTarget
} from './enhancement-targets.js';

type MountOperation = (
	value: Child,
	parentInstance: AnyComponentInstance | undefined,
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
	value: Child,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined
) => Mounted;

/** Activates all declarations rooted in one newly mounted logical subtree. */
export function activateEnhancementSubtree(
	root: Root,
	mounted: Mounted,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined,
	mount: MountOperation
): Mounted {
	if (!root.enhancementCatalog?.size) {
		reportUnavailableEnhancementDeclarations(root, mounted);
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
			if (hasActiveEnhancement(root, entry.identity)) return true;
			reportUnavailableEnhancement(root, entry.identity);
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

/** Patches an active enhancement chain while retaining the authored target as its public identity. */
export function patchEnhancementBoundary(
	root: Root,
	mounted: Mounted,
	next: Child,
	parent: Node,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined,
	patch: PatchOperation
): Mounted {
	const state = mounted.enhancement!;
	if (
		mounted.receivePreparedEnhancements?.(childEnhancementEntries(next), withoutEnhancements(next))
	) {
		mounted.enhancement = { ...state, operation: next, entries: childEnhancementEntries(next) };
		return mounted;
	}
	if (mounted.receivePreparedEnhancements) {
		const clean = deactivateEnhancementBoundary(
			root,
			parent,
			mounted,
			next,
			parentInstance,
			parentScope,
			patch
		);
		restoreMountedAuthoredOperation(clean, next);
		return activateEnhancementSubtree(
			root,
			clean,
			parentInstance,
			parentScope,
			(value, instance, scope) => patch(undefined, value, instance, scope)
		);
	}
	const local = new Map(
		childEnhancementEntries(next).map((entry) => [entry.identity, entry] as const)
	);
	const entries = state.entries
		.filter((entry) => state.inheritedIdentities.has(entry.identity) || local.has(entry.identity))
		.map((entry) => {
			const override = local.get(entry.identity);
			return override
				? Object.freeze({
						identity: entry.identity,
						props: Object.freeze({ ...entry.props, ...override.props }),
						...(override.intrinsicFragment === undefined
							? {}
							: { intrinsicFragment: override.intrinsicFragment }),
						...(override.root === undefined ? {} : { root: override.root })
					})
				: entry;
		});
	const active = entries.filter((entry) => hasActiveEnhancement(root, entry.identity));
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
	const chain = createEnhancementChain(root, active, withoutEnhancements(next));
	mounted.children = [patch(mounted.children[0], chain, parentInstance, mounted.scope)];
	state.operation = next;
	mounted.enhancement = {
		operation: next,
		entries: active,
		inheritedIdentities: state.inheritedIdentities,
		target: state.target,
		boundaries: state.boundaries
	};
	return mounted;
}

/** Replaces a changed attachment while preserving unrelated and nested enhancement boundaries. */
export function reconcileEnhancementRoutes(
	root: Root,
	mounted: Mounted,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined,
	mount: MountOperation
): Mounted {
	if (!root.enhancementCatalog?.size || root.enhancementReconciliationDepth) return mounted;
	root.enhancementReconciliationDepth = 1;
	let result = mounted;
	try {
		for (let attempts = 0; attempts < 32; attempts++) {
			const rerouted = findReroutedBoundary(result);
			if (!rerouted)
				return activateEnhancementSubtree(root, result, parentInstance, parentScope, mount);
			const enclosing = rerouted.wrapper;
			const location = findMountedLocation(
				result,
				enclosing,
				undefined,
				parentInstance,
				parentScope,
				enclosing.dom.parentNode ?? root.container
			);
			if (!location) return result;
			const clean = removeReroutedEnhancementPeer(
				root,
				enclosing,
				rerouted.identity,
				location.parentInstance
			)
				? enclosing
				: unwrapEnhancementSubtree(root, enclosing, location.parentScope);
			const activated = clean;
			if (location.owner) {
				const index = location.owner.children.indexOf(enclosing);
				if (index >= 0) location.owner.children[index] = activated;
			} else {
				result = activated;
			}
			result = activateEnhancementSubtree(root, result, parentInstance, parentScope, mount);
		}
		throw new Error('Enhancement target routing did not stabilize after 32 rebuilds');
	} finally {
		root.enhancementReconciliationDepth = 0;
	}
}

function findReroutedBoundary(
	mounted: Mounted
): { wrapper: Mounted; identity: string } | undefined {
	if (mounted.enhancement) {
		for (const [identity, boundaries] of mounted.enhancement.boundaries) {
			for (const boundary of boundaries) {
				if (!boundary.scope.active) continue;
				if (
					resolveEnhancementTarget(boundary, identity, undefined)?.mounted !==
					mounted.enhancement.target
				)
					return { wrapper: mounted, identity };
			}
		}
	}
	for (const child of mounted.children) {
		const boundary = findReroutedBoundary(child);
		if (boundary) return boundary;
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
		restoreMountedAuthoredOperation(target, mounted.enhancement.operation);
		const parent = mounted.dom.parentNode ?? root.container;
		transferEffectScope(target.scope, parentScope);
		placeMountedBefore(root, parent, target, mounted.dom);
		if (!releaseMountedRange(root, parent, mounted, 'enhancement-target-rerouted'))
			disposeMounted(parent, mounted);
		return target;
	}
	return mounted;
}

function wrapTarget(
	root: Root,
	target: EnhancementTarget,
	entries: readonly EnhancementEntry[],
	inheritedIdentities: ReadonlySet<string>,
	boundaries: ReadonlyMap<string, readonly Mounted[]>,
	parentScope: EffectScope | undefined,
	mount: MountOperation
): Mounted {
	const scope = createEffectScope(target.owner?.scope ?? parentScope);
	const start = createMarker(root, 'enhancement');
	const end = createMarker(root, 'enhancement-end');
	const targetKey = mountedEnhancementKey(target.mounted);
	const wrapper: Mounted = {
		...(targetKey === undefined ? {} : { operationKey: targetKey }),
		dom: start,
		end,
		scope,
		children: [],
		enhancement: {
			operation: mountedAuthoredOperation(target.mounted),
			entries,
			inheritedIdentities,
			target: target.mounted,
			boundaries
		}
	};
	installEnhancementRouteWatch(root, wrapper);
	const authored = mountedAuthoredOperation(target.mounted);
	const leaf = withoutEnhancements(authored);

	const physicalParent = target.mounted.dom.parentNode ?? document.createDocumentFragment();
	if (!target.mounted.dom.parentNode)
		placeMountedBefore(root, physicalParent, target.mounted, null);
	const afterTarget = lastMountedNode(target.mounted).nextSibling;
	physicalParent.insertBefore(start, target.mounted.dom);
	physicalParent.insertBefore(end, afterTarget);
	const previousParking = root.replacementParking;
	const parking = {
		mounts: new Map<Child, Array<{ mounted: Mounted; parent: Node }>>([
			[leaf, [{ mounted: target.mounted, parent: physicalParent }]]
		]),
		commits: [] as Array<() => void>
	};
	root.replacementParking = parking;
	let enhancement: Mounted;
	try {
		const prepared =
			readCompiledFragmentReceipt(leaf) &&
			entries.every(
				(entry) =>
					readExactEnhancementContexts(root.enhancementCatalog!.get(entry.identity)!)
						?.transparentTarget
			);
		enhancement = prepared
			? mountPreparedFragmentEnhancements(
					root,
					entries,
					leaf,
					target.parentInstance,
					scope,
					physicalParent
				)
			: mount(
					createEnhancementChain(root, entries, leaf),
					target.parentInstance,
					scope,
					physicalParent
				);
	} finally {
		root.replacementParking = previousParking;
	}
	for (const commit of parking.commits) commit();
	placeMountedBefore(root, physicalParent, enhancement, end);
	for (const remaining of parking.mounts.values())
		for (const parked of remaining) disposeMounted(parked.parent, parked.mounted);
	wrapper.children = [enhancement];
	wrapper.receivePreparedEnhancements = enhancement.receivePreparedEnhancements;
	return wrapper;
}

function deactivateEnhancementBoundary(
	root: Root,
	parent: Node,
	mounted: Mounted,
	next: Child,
	parentInstance: AnyComponentInstance | undefined,
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
