import {
	normalizeRenderResult,
	renderInstance,
	ServerSlot,
	unwrap,
	watch,
	type Child,
	type ComponentInstance,
	type VNode
} from '@exact/core';
import { withEffectScope, type EffectScope } from '@exact/reactive';
import { childToVNode, planChildReconciliation } from '../../children.js';
import { describeNode, describeVNodeType, domDebug } from '../../debug.js';
import { preserveFocus } from '../../focus.js';
import { afterMountedChildren, placeMountedBefore } from '../../placement.js';
import { adoptServerSlot } from '../../server-slots.js';
import type { Mounted, Root } from '../../types.js';
import { countDomWork, withDomWork } from '../limits.js';
import { longestIncreasingSubsequencePositions } from '../reconciliation.js';
import {
	attemptTeardown,
	removeMountedNodes,
	teardownFailure,
	throwTeardownFailure,
	unmountMounted
} from '../teardown.js';
import { patch } from './root.js';

export function patchChildren(
	root: Root,
	parent: Node,
	oldChildren: Mounted[],
	nextChildren: Child[],
	parentInstance?: ComponentInstance<any>,
	parentScope?: EffectScope,
	before?: Node | null
): Mounted[] {
	domDebug(root, 'patch children', {
		parent: describeNode(parent),
		oldCount: oldChildren.length,
		nextCount: nextChildren.length,
		before: describeNode(before)
	});
	// DOM writes for form controls can disturb the active element; patch inside the
	// focus-preservation helper so reorders and reactive updates stay ergonomic.
	return withDomWork(root, () =>
		preserveFocus(root, () => {
			for (const child of nextChildren) if (!childToVNode(child)) countDomWork(root);
			return patchChildrenInner(
				root,
				parent,
				oldChildren,
				nextChildren,
				parentInstance,
				parentScope,
				before
			);
		})
	);
}

export function patchChildrenInner(
	root: Root,
	parent: Node,
	oldChildren: Mounted[],
	nextChildren: Child[],
	parentInstance?: ComponentInstance<any>,
	parentScope?: EffectScope,
	before?: Node | null
): Mounted[] {
	const nextVNodes = nextChildren.map(childToVNode).filter((vnode): vnode is VNode => !!vnode);
	const nextKeys = new Set<string>();
	for (const vnode of nextVNodes) {
		if (vnode.key === undefined) continue;
		if (nextKeys.has(vnode.key))
			throw new Error(`Duplicate key "${vnode.key}" in rendered children`);
		nextKeys.add(vnode.key);
	}
	const plan = planChildReconciliation(oldChildren, nextVNodes);
	const keyedOldOrder = nextVNodes.map((vnode, index) => {
		if (vnode.key === undefined) return -1;
		const previous = plan.matches[index];
		return previous && previous.vnode.type === vnode.type ? plan.oldKeyIndices.get(vnode.key)! : -1;
	});
	const stableKeyedPositions = longestIncreasingSubsequencePositions(keyedOldOrder);
	const nextMounted: Mounted[] = [];
	let cursor = before ?? null;

	// Walk from the end so each placed node can use the already-positioned next
	// sibling as its insertion anchor. This keeps keyed moves deterministic.
	for (let index = nextVNodes.length - 1; index >= 0; index--) {
		const vnode = nextVNodes[index]!;
		const old = plan.matches[index];
		const patched = patch(root, parent, old, vnode, parentInstance, parentScope);
		if (vnode.type === ServerSlot) adoptServerSlot(parent, patched);
		nextMounted.unshift(patched);
		// Unkeyed children are reconciled positionally. A matching unkeyed mount
		// is already in the correct relative position; moving it merely because a
		// sibling was inserted can reorder it around fragment anchors. Apart from
		// producing visibly unstable lists, that detaches pointer-captured nodes
		// in browsers and ends active drags. Keyed children retain the LIS move
		// pass, while only genuinely new unkeyed children need placement here.
		if (
			vnode.key !== undefined
				? !stableKeyedPositions.has(index) || keyedOldOrder[index] === -1
				: !old
		) {
			placeMountedBefore(root, parent, patched, cursor);
		}
		cursor = patched.dom;
	}

	const retained = new Set(nextMounted);
	const teardown = teardownFailure();
	for (const old of oldChildren) {
		if (!retained.has(old)) {
			attemptTeardown(teardown, () => unmountMounted(old));
			attemptTeardown(teardown, () => removeMountedNodes(parent, old));
		}
	}
	throwTeardownFailure(teardown);

	return nextMounted;
}

export function rerenderComponent(root: Root, mounted: Mounted): void {
	if (!mounted.instance) return;
	if (!mounted.scope.active) return;
	if (mounted.rendering) {
		mounted.rerenderPending = true;
		return;
	}
	mounted.rendering = true;
	try {
		do {
			mounted.rerenderPending = false;
			domDebug(root, 'rerender component', {
				type: describeVNodeType(mounted.vnode.type),
				key: mounted.vnode.key ?? 'none'
			});
			const nextChildren = withEffectScope(mounted.scope, () =>
				normalizeRenderResult(
					renderInstance(mounted.instance!, () => rerenderComponent(root, mounted))
				)
			);
			mounted.children = patchChildren(
				root,
				mounted.dom.parentNode ?? root.container,
				mounted.children,
				nextChildren,
				mounted.instance,
				mounted.scope,
				afterMountedChildren(mounted)
			);
		} while (mounted.rerenderPending && mounted.scope.active);
	} finally {
		mounted.rendering = false;
	}
}

export function bindText(mounted: Mounted, value: unknown): void {
	mounted.stop?.();
	const node = mounted.dom as CharacterData;
	mounted.stop = watch(
		() => {
			const text = String(unwrap(value) ?? '');
			if (node.data !== text) {
				node.data = text;
			}
		},
		undefined,
		{ scope: mounted.scope }
	);
}
