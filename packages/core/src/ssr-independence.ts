import type { VNode } from './component/contracts.js';

const independentAsyncSiblings = new WeakSet<VNode>();

/** Marks a host whose direct async SSR siblings passed the compiler independence proof. */
export function markIndependentAsyncSiblings(vnode: VNode): VNode {
	independentAsyncSiblings.add(vnode);
	return vnode;
}

/** Rejects authored lookalikes by reading only the module-private proof set. */
export function hasIndependentAsyncSiblings(vnode: VNode): boolean {
	return independentAsyncSiblings.has(vnode);
}
