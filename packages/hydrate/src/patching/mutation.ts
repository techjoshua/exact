import { attemptCleanup, type CleanupFailure } from '@exact/core';
import {
	consumeDomWork,
	disposeOwnedSubtree,
	walkDomSubtree,
	type DomWorkBudget
} from '@exact/dom';
import { isExactItemStart } from './lookup.js';

export function replaceRange(
	range: { start: Comment; end: Comment },
	fragment: DocumentFragment | undefined,
	budget: DomWorkBudget,
	cleanupFailure: CleanupFailure
): void {
	const parent = range.end.parentNode;
	let cursor = range.start.nextSibling;
	while (cursor && cursor !== range.end) {
		consumeDomWork(budget);
		const next = cursor.nextSibling;
		if (cursor instanceof Element) {
			const element = cursor;
			attemptCleanup(cleanupFailure, () => disposeOwnedSubtree(element, true, budget));
		}
		cursor.parentNode?.removeChild(cursor);
		cursor = next;
	}
	if (fragment && parent) parent.insertBefore(fragment, range.end);
}

export function replaceElementChildren(
	element: Element,
	fragment: DocumentFragment | undefined,
	budget: DomWorkBudget,
	cleanupFailure: CleanupFailure
): void {
	attemptCleanup(cleanupFailure, () => disposeOwnedSubtree(element, false, budget));
	element.replaceChildren();
	if (fragment) element.appendChild(fragment);
}

export function replaceElement(
	element: Element,
	fragment: DocumentFragment | undefined,
	budget: DomWorkBudget,
	cleanupFailure: CleanupFailure
): void {
	attemptCleanup(cleanupFailure, () => disposeOwnedSubtree(element, true, budget));
	if (!fragment) {
		element.remove();
		return;
	}
	element.replaceWith(fragment);
}

export function insertFragmentBefore(anchor: Node, fragment: DocumentFragment | undefined): void {
	const parent = anchor.parentNode;
	if (parent && fragment) parent.insertBefore(fragment, anchor);
}

export function parseFragment(
	parent: Node,
	html: string,
	budget: DomWorkBudget
): { fragment: DocumentFragment; nodeCount: number } {
	let fragment: DocumentFragment;
	const ownerDocument =
		parent.nodeType === Node.DOCUMENT_NODE ? (parent as Document) : parent.ownerDocument;
	if (!ownerDocument) throw new Error('Cannot parse a patch fragment without an owner document');
	if (parent instanceof Element) {
		const range = ownerDocument.createRange();
		range.selectNodeContents(parent);
		fragment = range.createContextualFragment(html);
	} else {
		const template = ownerDocument.createElement('template');
		template.innerHTML = html;
		fragment = template.content;
	}
	const nodeCount = walkDomSubtree(fragment, () => undefined, { budget });
	return { fragment, nodeCount };
}

export function isValidListItemFragment(fragment: DocumentFragment, key: string): boolean {
	const stack: string[] = [];
	let started = false;
	let complete = false;
	for (const node of Array.from(fragment.childNodes)) {
		if (node instanceof Comment && node.data.startsWith('exact:')) {
			if (!stack.length) {
				if (started || complete || !isExactItemStart(node, key)) return false;
				started = true;
			}
			stack.push(node.data);
			continue;
		}
		if (node instanceof Comment && node.data.startsWith('/exact:')) {
			const start = stack.pop();
			if (!start || node.data !== `/${start}`) return false;
			if (!stack.length) complete = true;
			continue;
		}
		if (!stack.length && (!(node instanceof Text) || node.data.trim())) return false;
	}
	return started && complete && stack.length === 0;
}

export function moveRangeBefore(
	range: { start: Comment; end: Comment },
	anchor: Node,
	budget?: DomWorkBudget
): void {
	if (isNodeInsideRange(anchor, range)) return;
	const fragment = document.createDocumentFragment();
	let cursor: Node | null = range.start;
	while (cursor) {
		if (budget) consumeDomWork(budget);
		const next: Node | null = cursor.nextSibling;
		fragment.appendChild(cursor);
		if (cursor === range.end) break;
		cursor = next;
	}
	anchor.parentNode?.insertBefore(fragment, anchor);
}

export function isNodeInsideRange(node: Node, range: { start: Comment; end: Comment }): boolean {
	let cursor: Node | null = range.start;
	while (cursor) {
		if (cursor === node) return true;
		if (cursor === range.end) return false;
		cursor = cursor.nextSibling;
	}
	return false;
}
