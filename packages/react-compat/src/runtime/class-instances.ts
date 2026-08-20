import type { AnyComponentInstance } from '@exactjs/core';

const classInstanceOwners = new WeakMap<object, AnyComponentInstance>();
const unmountedClassInstances = new WeakSet<object>();

/** Associates a mounted React class instance with its owning eXact component. */
export function markReactClassInstanceMounted(value: object, owner: AnyComponentInstance): void {
	classInstanceOwners.set(value, owner);
	unmountedClassInstances.delete(value);
}

/** Releases a React class instance owner and records its terminal unmounted state. */
export function markReactClassInstanceUnmounted(value: object): void {
	classInstanceOwners.delete(value);
	unmountedClassInstances.add(value);
}

/** Resolves the eXact component that owns a React class instance. */
export function exactComponentForReactInstance(value: unknown): AnyComponentInstance | undefined {
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
