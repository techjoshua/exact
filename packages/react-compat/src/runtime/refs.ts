import { type RefBinding } from '@exactjs/core';
import { unwrap } from '@exactjs/reactive';
import type { ReactRef } from '../types.js';

/** Defines the react ref envelope class contract. */
export class ReactRefEnvelope {
	constructor(readonly value: unknown) {}
}

const objectRefEnvelopes = new WeakMap<object, ReactRefEnvelope>();

/** Performs the envelope react ref domain operation. */
export function envelopeReactRef(ref: unknown): ReactRefEnvelope {
	if (ref !== null && (typeof ref === 'object' || typeof ref === 'function')) {
		const identity = ref as object;
		let envelope = objectRefEnvelopes.get(identity);
		if (!envelope) {
			envelope = new ReactRefEnvelope(ref);
			objectRefEnvelopes.set(identity, envelope);
		}
		return envelope;
	}
	return new ReactRefEnvelope(ref);
}

/** Reads a react ref from its source representation. */
export function readReactRef(value: unknown): unknown {
	const candidate = unwrap(value);
	return candidate instanceof ReactRefEnvelope ? candidate.value : candidate;
}

/** Resolves a public React class instance to its eXact component owner. */

const refBindings = new WeakMap<object, RefBinding<unknown>>();
/** Performs the react ref binding domain operation. */
export function reactRefBinding<T>(ref: ReactRef<T>): RefBinding<T> {
	const identity = ref as object;
	const cached = refBindings.get(identity);
	if (cached) return cached as RefBinding<T>;
	let cleanup: (() => void) | undefined;
	const binding: RefBinding<T> = {
		key: { id: Symbol('react.ref'), description: 'React compatibility ref' },
		owner: undefined as never,
		fulfill(value) {
			const rawRef = unwrap(ref) as ReactRef<T>;
			if (value === undefined) {
				if (cleanup) {
					const run = cleanup;
					cleanup = undefined;
					run();
				} else if (typeof rawRef === 'function') rawRef(null);
				else if (rawRef) rawRef.current = null;
				return;
			}
			if (typeof rawRef === 'function') {
				const result = rawRef(value);
				cleanup = typeof result === 'function' ? result : undefined;
			} else if (rawRef) rawRef.current = value;
		}
	};
	refBindings.set(identity, binding as RefBinding<unknown>);
	return binding;
}

/** Performs the assign react ref domain operation. */
export function assignReactRef<T>(ref: ReactRef<T> | undefined, value: T | null): void {
	if (!ref) return;
	const rawRef = unwrap(ref) as ReactRef<T>;
	if (typeof rawRef === 'function') rawRef(value);
	else if (rawRef) rawRef.current = value;
}
