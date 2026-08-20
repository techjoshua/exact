import { type VNode, type VNodeCell } from '@exactjs/core';
import { getCellVNode } from '@exactjs/core/runtime/render';

/**
 * Returns the transparent child of a compiled cell with any later root ownership attached.
 *
 * Compilation creates the wrapper and child together, but root lifecycle can add an immutable
 * domain to the wrapper immediately before mount or adoption.
 */
export function getOwnedCellVNode(vnode: VNode<{ cell: VNodeCell }>): VNode {
	const child = getCellVNode(vnode);
	return vnode.domain && !child.domain ? { ...child, domain: vnode.domain } : child;
}
