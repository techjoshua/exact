import type { AnyComponentInstance } from '@exactjs/core';
import { componentMounts } from '../state.js';
import type { Mounted } from '../types.js';

/** Resolves the first host node currently presented by a durable component instance. */
export function findComponentDomNode(instance: AnyComponentInstance): Node | null {
	const mounted = componentMounts.get(instance);
	return mounted ? firstHostNode(mounted) : null;
}

/** Resolves the first host node in a mounted logical range. */
export function firstHostNode(mounted: Mounted): Node | null {
	if (mounted.intrinsicReceipt && mounted.dom instanceof Element) return mounted.dom;
	if (mounted.renderProgram?.programRoot instanceof Element)
		return mounted.renderProgram.programRoot;
	if (mounted.dom.nodeType === Node.TEXT_NODE && mounted.dom.textContent !== '') return mounted.dom;
	for (const child of mounted.children) {
		const node = firstHostNode(child);
		if (node) return node;
	}
	return null;
}
