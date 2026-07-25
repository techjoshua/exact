import { normalizeDocumentVNode, type VNode } from '@exactjs/core';
import type { Root } from '../../types.js';

/** Applies document-root vnode normalization before static adoption begins. */
export function normalizeAdoptionVNode(root: Root, vnode: VNode): VNode {
	return root.mode === 'document' &&
		typeof vnode.type === 'string' &&
		vnode.type.toLowerCase() === 'html'
		? normalizeDocumentVNode(vnode)
		: vnode;
}
