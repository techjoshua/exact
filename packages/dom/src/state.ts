import type { AnyComponentInstance, ExactRuntimeInspectionOwner, StopHandle } from '@exactjs/core';
import { componentDomainInspection } from '@exactjs/core/framework/component-domains';
import type { Mounted, Root } from './types.js';

type ExactDomInspectionOwnerFactory = (
	options: Readonly<{ buildKey?: string; executionRoot?: string; binding?: string }>
) => ExactRuntimeInspectionOwner | undefined;

/** Delegated callback and compiler-selected interaction policy bits. */
export type DelegatedEventBinding = readonly [
	handler: EventListener,
	/** Bit 0 selects direct interaction; bit 1 selects the closed argument-free call. */
	flags: number
];

type ExactDomRuntimeState = {
	roots: WeakMap<Element, Root>;
	eventHandlers: WeakMap<Element, Map<string, DelegatedEventBinding>>;
	directEventHandlers: WeakMap<
		Element,
		Map<string, { type: string; listener: EventListener; capture: boolean }>
	>;
	elementOwners: WeakMap<Element, AnyComponentInstance>;
	nodeOwners: WeakMap<Node, AnyComponentInstance>;
	propBindings: WeakMap<Element, Map<string, StopHandle>>;
	componentMounts: WeakMap<AnyComponentInstance, Mounted>;
	inspectableRoots: Set<WeakRef<Root>>;
	rootInspectionReferences: WeakMap<Root, WeakRef<Root>>;
	inspectionOwnerFactory?: ExactDomInspectionOwnerFactory;
};

const exactDomRuntimeStateKey = Symbol.for('@exactjs/dom.runtime-state');
const runtimeState: ExactDomRuntimeState = (() => {
	const scope = globalThis as typeof globalThis & {
		[exactDomRuntimeStateKey]?: ExactDomRuntimeState;
	};
	const initial: ExactDomRuntimeState = {
		roots: new WeakMap(),
		eventHandlers: new WeakMap(),
		directEventHandlers: new WeakMap(),
		elementOwners: new WeakMap(),
		nodeOwners: new WeakMap(),
		propBindings: new WeakMap(),
		componentMounts: new WeakMap(),
		inspectableRoots: new Set(),
		rootInspectionReferences: new WeakMap()
	};
	return (scope[exactDomRuntimeStateKey] ??= initial);
})();

/** Renderer roots shared by every loaded copy of the DOM package in this JavaScript realm. */
export const roots = runtimeState.roots;
/** Delegated event handlers shared by every loaded copy of the DOM package. */
export const eventHandlers = runtimeState.eventHandlers;
/** Direct event handlers shared by every loaded copy of the DOM package. */
export const directEventHandlers = runtimeState.directEventHandlers;
/** Element ownership shared with inspection and compatibility package copies. */
export const elementOwners = runtimeState.elementOwners;
/** Marker and text ownership shared with inspection and compatibility package copies. */
export const nodeOwners = runtimeState.nodeOwners;
/** Reactive property bindings shared by every loaded copy of the DOM package. */
export const propBindings = runtimeState.propBindings;
/** Component mount ranges shared with inspection and compatibility package copies. */
export const componentMounts = runtimeState.componentMounts;

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
	runtimeState.inspectionOwnerFactory = factory;
	return () => {
		if (runtimeState.inspectionOwnerFactory === factory)
			runtimeState.inspectionOwnerFactory = undefined;
	};
}

/** Returns the explicitly installed owner for a newly created renderer root. */
export function exactDomInspectionOwner(
	options: Readonly<{ buildKey?: string; executionRoot?: string; binding?: string }> = {}
): ExactRuntimeInspectionOwner | undefined {
	return runtimeState.inspectionOwnerFactory?.(options);
}

/** Registers one active root for bounded late-attachment inspection. */
export function registerInspectableRoot(root: Root): void {
	if (runtimeState.rootInspectionReferences.has(root)) return;
	const reference = new WeakRef(root);
	runtimeState.rootInspectionReferences.set(root, reference);
	runtimeState.inspectableRoots.add(reference);
}

/** Removes one disposed root from future late-attachment snapshots. */
export function unregisterInspectableRoot(root: Root): void {
	const reference = runtimeState.rootInspectionReferences.get(root);
	if (!reference) return;
	runtimeState.inspectableRoots.delete(reference);
	runtimeState.rootInspectionReferences.delete(root);
}

/** Materializes only live instrumented roots and prunes collected references. */
export function activeInspectableRoots(): readonly Root[] {
	const active: Root[] = [];
	for (const reference of runtimeState.inspectableRoots) {
		const root = reference.deref();
		if (!root) {
			runtimeState.inspectableRoots.delete(reference);
			continue;
		}
		if (root.domain && componentDomainInspection(root.domain)) active.push(root);
	}
	return Object.freeze(active);
}
