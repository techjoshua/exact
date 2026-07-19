import { unwrap, watch } from '@exact/core';
import type { Mounted, Root } from '../types.js';

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
	mounted.stop = watch(
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
		{ scope: mounted.scope }
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
