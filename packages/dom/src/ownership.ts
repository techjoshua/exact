import type { ComponentInstance } from '@exactjs/core';
import { elementOwners, nodeOwners } from './state.js';

/** Associates a DOM element with the component instance that rendered it. */
export function setElementOwner(element: Element, owner: ComponentInstance<any>): void {
	elementOwners.set(element, owner);
}

/** Removes the component ownership association for a DOM element. */
export function clearElementOwner(element: Element): void {
	elementOwners.delete(element);
}

/** Associates a framework marker or text node with its logical component owner. */
export function setNodeOwner(node: Node, owner: ComponentInstance<any>): void {
	nodeOwners.set(node, owner);
}

/** Removes the logical ownership association for a framework marker or text node. */
export function clearNodeOwner(node: Node): void {
	nodeOwners.delete(node);
}

/** Finds the closest component instance that owns an element or one of its ancestors. */
export function findOwnerInstance(element: Element): ComponentInstance<any> | undefined {
	let cursor: Element | null = element;
	while (cursor) {
		const owner = elementOwners.get(cursor);
		if (owner) return owner;
		cursor = cursor.parentElement;
	}
	return undefined;
}

/** Finds the closest logical component owner for any DOM node. */
export function findNodeOwnerInstance(node: Node): ComponentInstance<any> | undefined {
	let cursor: Node | null = node;
	while (cursor) {
		const direct = nodeOwners.get(cursor);
		if (direct) return direct;
		if (cursor instanceof Element) {
			const element = elementOwners.get(cursor);
			if (element) return element;
		}
		cursor = cursor.parentNode;
	}
	return undefined;
}
