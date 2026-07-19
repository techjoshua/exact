import type { ComponentInstance } from '@exact/core';
import { elementOwners } from './state.js';

/** Associates a DOM element with the component instance that rendered it. */
export function setElementOwner(element: Element, owner: ComponentInstance<any>): void {
	elementOwners.set(element, owner);
}

/** Removes the component ownership association for a DOM element. */
export function clearElementOwner(element: Element): void {
	elementOwners.delete(element);
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
