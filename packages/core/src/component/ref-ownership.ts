import type { RefBinding } from './contracts.js';

// A realm-stable origin survives compatible provider copies without freezing public observations.
const refOwner = Symbol.for('exact.ref-binding-owner.abi2');

/** Captures immutable framework ref provenance while leaving its public fields ordinary. */
export function registerComponentRefBindingOwner(binding: object, owner: object): void {
	Object.defineProperty(binding, refOwner, { value: owner });
}

/** Reads stable ownership, capturing an authored composed binding on its first root selection. */
export function componentRefBindingOwner(binding: RefBinding<unknown>): object {
	const origin = Object.getOwnPropertyDescriptor(binding, refOwner);
	if (origin) return origin.value as object;
	const owner = binding.owner;
	registerComponentRefBindingOwner(binding, owner);
	return owner;
}
