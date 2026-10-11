import { batch, trigger, reactiveMutationKeys } from '../internal/deps.js';
import type { MutationRestoration } from '../internal/deps.js';
import { reactiveDependencyKeys } from '../internal/dependency-graph.js';
import { propertyDescriptor } from './property-descriptors.js';

/**
 * Invalidates previously observed public accessors after private storage publication. Descriptor
 * lookup happens only on a private write and visits known dependencies, never collection storage.
 * Pull-only computed dependencies retain version invalidation after their subscriptions detach.
 */
export function notifyReactiveAccessorWrite(target: object): void {
	batch(() => {
		for (const key of accessorDependencyKeys(target))
			if (propertyDescriptor(target, key)?.get) trigger(target, key);
	});
}

/** Invalidates private-accessor caches during rollback without publishing an intermediate notification. */
export function restoreReactiveAccessorWrite(
	target: object,
	restoration: MutationRestoration
): void {
	for (const key of accessorDependencyKeys(target))
		if (propertyDescriptor(target, key)?.get) restoration.notify(target, key);
}

/** Combines live subscriptions and detached pull versions only when branded storage publishes. */
function accessorDependencyKeys(target: object): Set<PropertyKey> {
	const keys = new Set(reactiveDependencyKeys(target));
	for (const key of reactiveMutationKeys(target)) keys.add(key);
	return keys;
}
