import type { VNode } from './component/contracts.js';

const finiteClientBoundaries = new WeakSet<VNode>();

/** Marks a client boundary whose complete prop keys were proven by the compiler. */
export function markFiniteClientBoundary(vnode: VNode): VNode {
	finiteClientBoundaries.add(vnode);
	return vnode;
}

/** Returns whether a boundary carries the module-private compiler proof. */
export function isFiniteClientBoundary(vnode: VNode): boolean {
	return finiteClientBoundaries.has(vnode);
}
