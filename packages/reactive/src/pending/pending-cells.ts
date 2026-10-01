import { pendingOwnKeys, pendingDescriptor } from './pending-reflection.js';
import type { PendingCollectionDelta } from './collection-deltas.js';
import type { PendingArrayState, PendingPropertyValue } from './pending-reflection.js';

/** Shares lazy pending storage across alias-specific helper contexts in one invocation. */
export class PendingInvocationCells {
	/** Touched own properties, allocated on the first property mutation. */
	properties?: WeakMap<object, Map<PropertyKey, PendingPropertyValue>>;
	/** Native collection deltas, allocated when a collection needs a pending view. */
	collections?: WeakMap<object, PendingCollectionDelta>;
	/** Sparse Array length metadata, allocated on the first Array write. */
	arrays?: WeakMap<object, PendingArrayState>;

	/** Enumerates pending receiver storage only at authored reflection boundaries. */
	keys(target: object, raw: object, pending: boolean): (string | symbol)[] {
		return pendingOwnKeys(
			target,
			pending ? this.properties?.get(raw) : undefined,
			pending ? this.arrays?.get(raw) : undefined
		);
	}

	/** Exposes pending descriptor values without changing native descriptor attributes. */
	descriptor(
		target: object,
		raw: object,
		key: PropertyKey,
		pending: boolean
	): PropertyDescriptor | undefined {
		return pendingDescriptor(
			target,
			key,
			pending ? this.properties?.get(raw) : undefined,
			pending ? this.arrays?.get(raw) : undefined
		);
	}

	/** Releases captured pending values after publication or cancellation without scanning storage. */
	clear(): void {
		this.properties = undefined;
		this.collections = undefined;
		this.arrays = undefined;
	}
}
