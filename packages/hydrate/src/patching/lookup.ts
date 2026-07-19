import { encodeExactMarkerPart } from '@exact/core';
import { walkDomSubtree } from '@exact/dom';
import { type ExactRange, type ProtocolIndex } from './planning.js';

export function findExactTarget(
	container: Element,
	id: string,
	index?: ProtocolIndex
): Node | undefined {
	const range = findExactRange(container, id, index);
	if (!range) return findExactElement(container, id, index);
	let node = range.start.nextSibling;
	while (node && node !== range.end) {
		if (node.nodeType !== Node.COMMENT_NODE) return node;
		node = node.nextSibling;
	}
	return undefined;
}

export function findExactElement(
	container: Element,
	id: string,
	index?: ProtocolIndex
): Element | undefined {
	if (index) return index.exactElements.get(id);
	return findElementByExactAttribute(container, 'data-exact-id', id);
}

export function findServerSlotElement(
	container: Element,
	id: string,
	index?: ProtocolIndex
): Element | undefined {
	if (index) return index.serverSlots.get(id);
	return findElementByExactAttribute(container, 'data-exact-server-slot', id);
}

export function findClientBoundaryElement(
	container: Element,
	id: string,
	index?: ProtocolIndex
): Element | undefined {
	if (index) return index.clientBoundaries.get(id);
	return findElementByExactAttribute(container, 'data-exact-client-boundary', id);
}

export function findElementByExactAttribute(
	container: Element,
	attribute: string,
	id: string
): Element | undefined {
	let match: Element | undefined;
	walkDomSubtree(container, (node) => {
		if (!match && node instanceof Element && node.getAttribute(attribute) === id) match = node;
	});
	return match;
}

export function findExactElementTarget(
	container: Element,
	id: string,
	index?: ProtocolIndex
): Element | undefined {
	const exact = findExactElement(container, id, index);
	if (exact) return exact;
	const range = findExactRange(container, id, index);
	if (!range) return undefined;
	let node = range.start.nextSibling;
	while (node && node !== range.end) {
		if (node.nodeType === Node.ELEMENT_NODE) return node as Element;
		node = node.nextSibling;
	}
	return undefined;
}

export function findExactRange(
	container: Element,
	id: string,
	index?: ProtocolIndex
): ExactRange | undefined {
	if (index) return index.ranges.get(id);
	let start: Comment | undefined;
	let result: ExactRange | undefined;
	walkDomSubtree(container, (node) => {
		if (result || !(node instanceof Comment)) return;
		const comment = node;
		if (comment.data === `exact:${id}`) start = comment;
		if (start && comment.data === `/exact:${id}`) result = { start, end: comment };
	});
	return result;
}

export function findExactItemRange(
	container: Element,
	key: string,
	within?: { start: Comment; end: Comment }
): { start: Comment; end: Comment } | undefined {
	let inRange = !within;
	let start: Comment | undefined;
	let result: ExactRange | undefined;
	walkDomSubtree(container, (node) => {
		if (result || !(node instanceof Comment)) return;
		const comment = node;
		if (within && comment === within.start) {
			inRange = true;
			return;
		}
		if (within && comment === within.end) {
			inRange = false;
			return;
		}
		if (!inRange) return;
		if (isExactItemStart(comment, key)) start = comment;
		if (start && comment.data === `/${start.data}`) result = { start, end: comment };
	});
	return result;
}

export function isExactItemStart(comment: Comment, key: string): boolean {
	if (!comment.data.startsWith('exact:item:')) return false;
	const suffix = comment.data.slice(comment.data.lastIndexOf(':') + 1);
	return (
		suffix === key || suffix === encodeExactMarkerPart(key) || comment.data.endsWith(`:${key}`)
	);
}

export function findIndexedItem(
	index: ProtocolIndex,
	listId: string,
	key: string
): ExactRange | undefined {
	const items = index.listItems.get(listId);
	if (!items) return undefined;
	return items.get(key) ?? items.get(encodeExactMarkerPart(key));
}
