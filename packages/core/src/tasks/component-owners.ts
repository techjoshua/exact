import type { AnyComponentInstance } from '../component/contracts.js';

const owners = new WeakMap<AbortSignal, AnyComponentInstance>();

/** Associates one task generation with its component's pause, cancellation, and error boundaries. */
export function trackTaskOwner(signal: AbortSignal, owner: AnyComponentInstance): void {
	owners.set(signal, owner);
}

/** Finds the component for task awaits and owned resource callbacks, including detached receivers. */
export function componentForTaskSignal(signal: AbortSignal): AnyComponentInstance | undefined {
	return owners.get(signal);
}
