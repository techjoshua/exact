import { unwrap } from './internal/values.js';

/** Explicit property access for helpers that accept reactive or task-owned state. */
export interface StateAccess<State extends object> {
	/** Reads through the supplied state view, preserving tracking and pending values. */
	read<Key extends keyof State>(key: Key): State[Key];
	/** Writes through the supplied view, preserving readonly policy and transaction ownership. */
	write<Key extends keyof State>(key: Key, value: State[Key]): State[Key];
	/** Removes a property through the supplied view, preserving its mutation policy. */
	remove<Key extends keyof State>(key: Key): boolean;
}

/**
 * Gives an ordinary helper explicit access to the state value supplied by its caller.
 * Works with plain objects, reactive objects and task-owned views without an ambient transaction.
 * The capability retains that view's lifetime. A task view cannot be reused after its task closes.
 * Private fields and unrelated external effects are outside this property-access contract.
 * Creating access does not enroll plain storage in a transaction or bypass readonly restrictions.
 */
export function stateAccess<State extends object>(state: State): StateAccess<State> {
	return {
		read: (key) => Reflect.get(state, key),
		write: (key, value) => {
			if (!Reflect.set(state, key, value)) throw new TypeError('Cannot assign state property');
			return value;
		},
		remove: (key) => Reflect.deleteProperty(state, key)
	};
}

/**
 * Compares storage identity across ordinary, reactive and task-owned object views.
 * Uses Object.is for scalar values. It does not expose raw storage, enroll objects in a
 * transaction, or change JavaScript equality and identity-keyed collection semantics.
 */
export function sameStateTarget(left: unknown, right: unknown): boolean {
	return Object.is(unwrap(left), unwrap(right));
}
