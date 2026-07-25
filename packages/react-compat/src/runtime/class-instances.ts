import type { ComponentInstance } from '@exactjs/core';

const classInstanceOwners = new WeakMap<object, ComponentInstance<any>>();
const unmountedClassInstances = new WeakSet<object>();

/** Associates a mounted React class instance with its owning eXact component. */
export function markReactClassInstanceMounted(value: object, owner: ComponentInstance<any>): void {
	classInstanceOwners.set(value, owner);
	unmountedClassInstances.delete(value);
}

/** Releases a React class instance owner and records its terminal unmounted state. */
export function markReactClassInstanceUnmounted(value: object): void {
	classInstanceOwners.delete(value);
	unmountedClassInstances.add(value);
}

/** Resolves the eXact component that owns a React class instance. */
export function exactComponentForReactInstance(value: unknown): ComponentInstance<any> | undefined {
	return value !== null && (typeof value === 'object' || typeof value === 'function')
		? classInstanceOwners.get(value as object)
		: undefined;
}

/** Reports whether a React class instance has completed unmounting. */
export function isUnmountedReactClassInstance(value: unknown): boolean {
	return value !== null && (typeof value === 'object' || typeof value === 'function')
		? unmountedClassInstances.has(value as object)
		: false;
}
