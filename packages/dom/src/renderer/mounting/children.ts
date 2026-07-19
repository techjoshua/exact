import { ServerSlot, type Child, type ComponentInstance, type VNode } from '@exact/core';
import { type EffectScope } from '@exact/reactive';
import { childToVNode } from '../../children.js';
import { placeMountedBefore } from '../../placement.js';
import { adoptServerSlot } from '../../server-slots.js';
import type { Mounted, Root } from '../../types.js';
import { countDomWork } from '../limits.js';
import { mount } from './root.js';

export function mountDetachedChildren(
	root: Root,
	children: Child[],
	parentInstance?: ComponentInstance<any>,
	parentScope?: EffectScope,
	parentNode?: Node
): Mounted[] {
	assertUniqueChildKeys(children);
	const mounted: Mounted[] = [];
	for (const child of children) {
		const vnode = childToVNode(child);
		if (!vnode) {
			countDomWork(root);
			continue;
		}
		mounted.push(mount(root, vnode, parentInstance, parentScope, parentNode));
	}
	return mounted;
}

export function portalTarget(vnode: VNode): Node {
	const target = vnode.props.target;
	if (!(target instanceof Node)) throw new TypeError('An eXact portal target must be a DOM Node');
	return target;
}

export function withEventContainer<T>(root: Root, container: Node, run: () => T): T {
	const previous = root.eventContainer;
	root.eventContainer = container;
	try {
		return run();
	} finally {
		root.eventContainer = previous;
	}
}

export function portalEventContainer(root: Root, target: Node): Node {
	return root.container === target || root.container.contains(target) ? root.container : target;
}

export function mountChildren(
	root: Root,
	parent: Node,
	children: Child[],
	parentInstance?: ComponentInstance<any>,
	parentScope?: EffectScope
): Mounted[] {
	assertUniqueChildKeys(children);
	const mounted: Mounted[] = [];
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
}

export function assertUniqueChildKeys(children: Child[]): void {
	const keys = new Set<string>();
	for (const child of children) {
		const vnode = childToVNode(child);
		if (!vnode || vnode.key === undefined) continue;
		if (keys.has(vnode.key)) throw new Error(`Duplicate key "${vnode.key}" in rendered children`);
		keys.add(vnode.key);
	}
}
