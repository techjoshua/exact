import type { ExactServerSlotReceiptData } from '@exactjs/core/runtime/component-operations';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from './types.js';
import { walkDomSubtree } from './work.js';

/** Mounts or reclaims one opaque compiler-owned server range. */
export function mountServerSlotReceipt(
	root: Root,
	receipt: ExactServerSlotReceiptData,
	scope: EffectScope
): Mounted {
	const element =
		findServerSlotDeep(root.container, receipt.id, root.maxTreeNodes) ??
		document.createElement('span');
	element.setAttribute('data-exact-server-slot', receipt.id);
	if (element instanceof HTMLElement) element.style.display = 'contents';
	return { serverSlotReceipt: receipt, dom: element, scope, children: [] };
}

/** Adopts a retained server range at its exact SSR cursor. */
export function adoptServerSlotReceipt(
	receipt: ExactServerSlotReceiptData,
	nodes: readonly Node[],
	cursor: number,
	scope: EffectScope
): { mounted: Mounted; next: number } | undefined {
	const element = nodes[cursor];
	if (
		!(element instanceof Element) ||
		element.getAttribute('data-exact-server-slot') !== receipt.id
	)
		return undefined;
	return {
		mounted: { serverSlotReceipt: receipt, dom: element, scope, children: [] },
		next: cursor + 1
	};
}

/** Repoints a mounted server slot at an existing matching element under the parent. */
export function adoptServerSlot(parent: Node, mounted: Mounted): void {
	const id = mounted.serverSlotReceipt?.id;
	if (id === undefined) return;
	const existing = findServerSlot(parent, id);
	if (!existing || existing === mounted.dom) return;
	mounted.dom = existing;
}

function findServerSlot(parent: Node, id: string): Element | undefined {
	for (const child of Array.from(parent.childNodes)) {
		if (child instanceof Element && child.getAttribute('data-exact-server-slot') === id) {
			return child;
		}
	}
	return undefined;
}

function findServerSlotDeep(parent: Node, id: string, maxNodes: number): Element | undefined {
	let match: Element | undefined;
	walkDomSubtree(
		parent,
		(node) => {
			if (!match && node instanceof Element && node.getAttribute('data-exact-server-slot') === id)
				match = node;
		},
		{ maxNodes }
	);
	return match;
}
