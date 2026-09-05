import { unwrap } from '@exactjs/core';
import { watchRetained } from '@exactjs/reactive/framework/watch';
import type { Mounted, Root } from '../types.js';
import type { ExactUnsafeHtmlReceiptData } from '@exactjs/core/runtime/component-operations';
import { createEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';

/** Mounts one compiler-authorized raw-HTML range. */
export function mountUnsafeHtmlReceipt(
	root: Root,
	receipt: ExactUnsafeHtmlReceiptData,
	parentScope?: EffectScope
): Mounted {
	assertUnsafeHtmlAllowed(root);
	const id = 'exact:unsafe-html:client';
	const mounted: Mounted = {
		unsafeHtmlReceipt: receipt,
		dom: document.createComment(id),
		end: document.createComment(`/${id}`),
		scope: createEffectScope(parentScope),
		children: [],
		rawNodes: []
	};
	bindUnsafeHtml(root, mounted, receipt.value);
	return mounted;
}

/** Adopts one compiler-authorized raw-HTML marker range. */
export function adoptUnsafeHtmlReceipt(
	root: Root,
	receipt: ExactUnsafeHtmlReceiptData,
	nodes: readonly Node[],
	cursor: number,
	parentScope: EffectScope,
	rangeEnd: number
): { mounted: Mounted; next: number } | undefined {
	assertUnsafeHtmlAllowed(root);
	const start = nodes[cursor];
	if (!(start instanceof Comment) || !start.data.startsWith('exact:unsafe-html:')) return undefined;
	let endIndex = -1;
	for (let index = cursor + 1; index < rangeEnd; index++)
		if (nodes[index] instanceof Comment && (nodes[index] as Comment).data === `/${start.data}`) {
			endIndex = index;
			break;
		}
	if (endIndex < 0) return undefined;
	const mounted: Mounted = {
		unsafeHtmlReceipt: receipt,
		dom: start,
		end: nodes[endIndex]!,
		scope: createEffectScope(parentScope),
		children: [],
		rawNodes: nodes.slice(cursor + 1, endIndex)
	};
	bindUnsafeHtml(root, mounted, receipt.value, true);
	return { mounted, next: endIndex + 1 };
}

/** Validates unsafe html allowed and throws when the contract is violated. */
export function assertUnsafeHtmlAllowed(root: Root): void {
	if (!root.allowUnsafeHtml) {
		throw new Error(
			'unsafeHtml() requires allowUnsafeHtml: true on the native eXact render or hydration root.'
		);
	}
}

/** Performs the bind unsafe html domain operation. */
export function bindUnsafeHtml(
	root: Root,
	mounted: Mounted,
	value: unknown,
	adopted = false
): void {
	mounted.stop?.();
	let first = adopted;
	let previous = adopted ? rawHtmlForNodes(mounted.rawNodes ?? []) : undefined;
	mounted.stop = watchRetained(
		() => {
			const html = String(unwrap(value) ?? '');
			if (first && previous === html) {
				first = false;
				return;
			}
			first = false;
			previous = html;
			root.onUnsafeHtml?.({ characters: html.length });
			replaceUnsafeHtmlRange(mounted, html);
		},
		undefined,
		{ scope: mounted.scope, onRelease: () => (mounted.stop = undefined) }
	);
}

/** Performs the replace unsafe html range domain operation. */
export function replaceUnsafeHtmlRange(mounted: Mounted, html: string): void {
	const template = document.createElement('template');
	template.innerHTML = html;
	const next = Array.from(template.content.childNodes);
	const parent = mounted.dom.parentNode;
	if (parent && mounted.end?.parentNode === parent) {
		for (const node of mounted.rawNodes ?? []) {
			if (node.parentNode === parent) parent.removeChild(node);
		}
		for (const node of next) parent.insertBefore(node, mounted.end);
	}
	mounted.rawNodes = next;
}

/** Performs the raw html for nodes domain operation. */
export function rawHtmlForNodes(nodes: readonly Node[]): string {
	const template = document.createElement('template');
	for (const node of nodes) template.content.appendChild(node.cloneNode(true));
	return template.innerHTML;
}
