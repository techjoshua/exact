import type { ComponentInstance } from './contracts.js';

/** Transfers a live component to a new logical parent during renderer-owned root replacement. */
export function reparentComponentInstance(
	instance: ComponentInstance<any>,
	parent?: ComponentInstance<any>
): void {
	for (let cursor = parent; cursor; cursor = cursor.parent) {
		if (cursor === instance) throw new Error('Cannot create a component parent cycle');
	}
	instance.parent = parent;
}
