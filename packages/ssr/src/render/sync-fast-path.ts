import { Text, UnsafeHtml, isVNode, type VNode } from '@exactjs/core';
import { RenderProgram, getCellVNode, isCellVNode } from '@exactjs/core/framework/render-structure';
import type { SsrContext } from '../types.js';

/**
 * Reports whether async SSR can delegate a finite intrinsic subtree to the synchronous walker.
 * The predicate never evaluates reactive or structural children, so selecting the fast path cannot
 * duplicate authored work or hide a promise-producing boundary.
 */
export function canRenderSsrSubtreeSynchronously(context: SsrContext, vnode: VNode): boolean {
	if (context.enhancementCatalog || vnode.enhancement?.entries.length) return false;
	if (isCellVNode(vnode)) return canRenderSsrSubtreeSynchronously(context, getCellVNode(vnode));
	if (vnode.type === RenderProgram) return false;
	if (vnode.type === Text || vnode.type === UnsafeHtml) return true;
	if (typeof vnode.type !== 'string') return false;
	for (const child of vnode.children) {
		if (isVNode(child) && !canRenderSsrSubtreeSynchronously(context, child)) return false;
	}
	return true;
}
