import type { RefBinding } from '@exactjs/core';
import { adoptElementId, reserveElementId } from '@exactjs/core';
import { unwrap } from '@exactjs/reactive/framework/values';

type PreparedRefIdentity = Readonly<{
	props: Record<string, unknown>;
	ref: unknown;
	id?: unknown;
	capturedId: boolean;
	generatedId?: string;
}>;

/**
 * Owns a serialization view of one compiler-created intrinsic bag. Private-brand checks
 * do not probe authored objects or proxy properties. Other attributes stay on the original
 * bag, retaining their descriptors, order, receiver and deferred access until serialization.
 */
export class PreparedIntrinsicRefAttributes {
	#identity: PreparedRefIdentity;

	constructor(identity: PreparedRefIdentity) {
		this.#identity = identity;
	}

	/** Reads only this private carrier brand without probing authored properties, otherwise returns undefined. */
	static read(value: unknown): PreparedRefIdentity | undefined {
		return value !== null && typeof value === 'object' && #identity in value
			? value.#identity
			: undefined;
	}
}

/** Uses the existing token policy without treating defined invalid IDs as absent. */
export function prepareRefIdentity(
	binding: RefBinding<{ id: string }>,
	id: unknown
): string | undefined {
	if (id !== undefined) {
		adoptElementId(binding, id);
		return undefined;
	}
	return reserveElementId(binding);
}

/**
 * Captures only effective ref/id for a compiler-owned nonroot bag, once per attempt.
 * Own spread values have already been evaluated. No other accessor is read or copied here.
 * The view retains the original bag without mutating it, and serialization cannot repeat
 * identity access or reservation. Falsey data refs and absent refs need no view or id read.
 * A falsey accessor ref still needs a view to avoid reading that accessor a second time.
 * Reservation uses the binding's existing identity lifetime, including if later work fails.
 */
export function prepareIntrinsicRefAttributes(props: Record<string, unknown>): unknown {
	const descriptor = Object.getOwnPropertyDescriptor(props, 'ref');
	if (!descriptor || ('value' in descriptor && !descriptor.value)) return props;
	const ref = props.ref;
	if (!ref) return new PreparedIntrinsicRefAttributes({ props, ref, capturedId: false });
	const binding = unwrap(ref) as RefBinding<{ id: string }>;
	const id = unwrap(props.id);
	const generatedId = prepareRefIdentity(binding, id);
	return new PreparedIntrinsicRefAttributes({ props, ref, id, capturedId: true, generatedId });
}
