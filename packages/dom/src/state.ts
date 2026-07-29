import type { ComponentInstance, StopHandle } from '@exactjs/core';
import type { Mounted, Root } from './types.js';

/** Provides the canonical roots value. */
export const roots = new WeakMap<Element, Root>();
/** Provides the canonical event handlers value. */
export const eventHandlers = new WeakMap<Element, Map<string, EventListener>>();
/** Provides the canonical direct event handlers value. */
export const directEventHandlers = new WeakMap<
	Element,
	Map<string, { type: string; listener: EventListener; capture: boolean }>
>();
/** Provides the canonical element owners value. */
export const elementOwners = new WeakMap<Element, ComponentInstance<any>>();
/** Provides ownership for framework marker and text nodes. */
export const nodeOwners = new WeakMap<Node, ComponentInstance<any>>();
/** Provides the canonical prop bindings value. */
export const propBindings = new WeakMap<Element, Map<string, StopHandle>>();
/** Provides the canonical component mounts value. */
export const componentMounts = new WeakMap<ComponentInstance<any>, Mounted>();

const inspectableRoots = new Set<WeakRef<Root>>();
const rootInspectionReferences = new WeakMap<Root, WeakRef<Root>>();

/** Registers one active root for bounded late-attachment inspection. */
export function registerInspectableRoot(root: Root): void {
	if (rootInspectionReferences.has(root)) return;
	const reference = new WeakRef(root);
	rootInspectionReferences.set(root, reference);
	inspectableRoots.add(reference);
}

/** Removes one disposed root from future late-attachment snapshots. */
export function unregisterInspectableRoot(root: Root): void {
	const reference = rootInspectionReferences.get(root);
	if (!reference) return;
	inspectableRoots.delete(reference);
	rootInspectionReferences.delete(root);
}

/** Materializes only live instrumented roots and prunes collected references. */
export function activeInspectableRoots(): readonly Root[] {
	const active: Root[] = [];
	for (const reference of inspectableRoots) {
		const root = reference.deref();
		if (!root) {
			inspectableRoots.delete(reference);
			continue;
		}
		if (root.current.domain?.inspection) active.push(root);
	}
	return Object.freeze(active);
}
