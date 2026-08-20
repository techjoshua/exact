import {
	attachSuppressedCleanupFailure,
	type Child,
	type ComponentInstance,
	type VNode
} from '@exactjs/core';
import { ServerSlot } from '@exactjs/core/runtime/render';
import { type EffectScope } from '@exactjs/reactive';
import { childToVNode } from '../../children.js';
import { placeMountedBefore } from '../../placement.js';
import { adoptServerSlot } from '../../server-slots.js';
import type { Mounted, Root } from '../../types.js';
import { countDomWork } from '../limits.js';
import { disposeMounted } from '../teardown.js';
import { mount } from './root.js';

/** Performs the mount detached children domain operation. */
export function mountDetachedChildren(
	root: Root,
	children: Child[],
	parentInstance?: ComponentInstance<any>,
	parentScope?: EffectScope,
	parentNode?: Node
): Mounted[] {
	assertUniqueChildKeys(children);
	const mounted: Mounted[] = [];
	try {
		for (const child of children) {
			const vnode = childToVNode(child);
			if (!vnode) {
				countDomWork(root);
				continue;
			}
			mounted.push(mount(root, vnode, parentInstance, parentScope, parentNode));
		}
		return mounted;
	} catch (error) {
		rollbackMountedChildren(mounted, undefined, error);
		throw error;
	}
}

/** Performs the portal target domain operation. */
export function portalTarget(vnode: VNode): Node {
	const target = vnode.props.target;
	if (!(target instanceof Node)) throw new TypeError('An eXact portal target must be a DOM Node');
	return target;
}

/** Performs the with event container domain operation. */
export function withEventContainer<T>(root: Root, container: Node, run: () => T): T {
	const previous = root.eventContainer;
	root.eventContainer = container;
	try {
		return run();
	} finally {
		root.eventContainer = previous;
	}
}

/** Performs the portal event container domain operation. */
export function portalEventContainer(root: Root, target: Node): Node {
	return root.container === target || root.container.contains(target) ? root.container : target;
}

/** Performs the mount children domain operation. */
export function mountChildren(
	root: Root,
	parent: Node,
	children: Child[],
	parentInstance?: ComponentInstance<any>,
	parentScope?: EffectScope
): Mounted[] {
	assertUniqueChildKeys(children);
	const mounted: Mounted[] = [];
	try {
		for (const child of children) {
			const vnode = childToVNode(child);
			if (!vnode) {
				countDomWork(root);
				continue;
			}
			const childMounted = mount(root, vnode, parentInstance, parentScope, parent);
			if (vnode.type === ServerSlot) adoptServerSlot(parent, childMounted);
			mounted.push(childMounted);
			placeMountedBefore(root, parent, childMounted, null);
		}
		return mounted;
	} catch (error) {
		rollbackMountedChildren(mounted, parent, error);
		throw error;
	}
}

/**
 * Rolls back provisional children in reverse ownership order.
 *
 * Detached roots use a temporary parent only as the traversal origin; portal
 * descendants still remove themselves from their actual portal targets.
 */
function rollbackMountedChildren(
	mounted: readonly Mounted[],
	parent: Node | undefined,
	primary: unknown
): void {
	for (let index = mounted.length - 1; index >= 0; index--) {
		const child = mounted[index]!;
		const removalParent = parent ?? child.dom.parentNode ?? document.createDocumentFragment();
		try {
			disposeMounted(removalParent, child);
		} catch (cleanup) {
			attachSuppressedCleanupFailure(primary, cleanup);
		}
	}
}

/** Validates unique child keys and throws when the contract is violated. */
export function assertUniqueChildKeys(children: Child[]): void {
	const keys = new Set<string>();
	for (const child of children) {
		const vnode = childToVNode(child);
		if (!vnode || vnode.key === undefined) continue;
		if (keys.has(vnode.key)) throw new Error(`Duplicate key "${vnode.key}" in rendered children`);
		keys.add(vnode.key);
	}
}
