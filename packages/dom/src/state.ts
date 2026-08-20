import type { AnyComponentInstance, ExactRuntimeInspectionOwner, StopHandle } from '@exactjs/core';
import { componentDomainInspection } from '@exactjs/core/framework/component-domains';
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
export const elementOwners = new WeakMap<Element, AnyComponentInstance>();
/** Provides ownership for framework marker and text nodes. */
export const nodeOwners = new WeakMap<Node, AnyComponentInstance>();
/** Provides the canonical prop bindings value. */
export const propBindings = new WeakMap<Element, Map<string, StopHandle>>();
/** Provides the canonical component mounts value. */
export const componentMounts = new WeakMap<AnyComponentInstance, Mounted>();

const inspectableRoots = new Set<WeakRef<Root>>();
const rootInspectionReferences = new WeakMap<Root, WeakRef<Root>>();
type ExactDomInspectionOwnerFactory = (
	options: Readonly<{ buildKey?: string; executionRoot?: string; binding?: string }>
) => ExactRuntimeInspectionOwner | undefined;
let inspectionOwnerFactory: ExactDomInspectionOwnerFactory | undefined;

/** Sets the optional owner inherited by subsequently created application roots. */
export function setExactDomInspectionOwner(
	owner: ExactRuntimeInspectionOwner | undefined
): () => void {
	return setExactDomInspectionOwnerFactory(owner ? () => owner : undefined);
}

/** Installs an instrumented-build owner factory and returns generation-safe cleanup. */
export function setExactDomInspectionOwnerFactory(
	factory: ExactDomInspectionOwnerFactory | undefined
): () => void {
	inspectionOwnerFactory = factory;
	return () => {
		if (inspectionOwnerFactory === factory) inspectionOwnerFactory = undefined;
	};
}

/** Returns the explicitly installed owner for a newly created renderer root. */
export function exactDomInspectionOwner(
	options: Readonly<{ buildKey?: string; executionRoot?: string; binding?: string }> = {}
): ExactRuntimeInspectionOwner | undefined {
	return inspectionOwnerFactory?.(options);
}

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
		if (root.current.domain && componentDomainInspection(root.current.domain)) active.push(root);
	}
	return Object.freeze(active);
}
