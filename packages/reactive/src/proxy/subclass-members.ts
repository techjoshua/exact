import { mutateArray } from '../arrays/mutation.js';
import { unwrap } from '../internal/values.js';
import type { ReactiveProxyRecord } from './capabilities.js';
import { track } from '../internal/deps.js';
import { iterateKey } from '../internal/symbols.js';
import type { ReactiveOptions } from '../internal/types.js';
import { captureCustomProperties } from './custom-member-properties.js';
import { samePropertyDescriptor } from './property-descriptors.js';

type Member = (...args: unknown[]) => unknown;
const members = new WeakMap<object, WeakMap<Member, Member>>();

/** Preserves Array subclass brands and method identity while observing public mutations. */
export function customArrayMember(
	target: unknown[],
	receiver: object,
	method: Member,
	key: PropertyKey,
	options: ReactiveOptions,
	wrap: (value: unknown) => unknown
): Member {
	track(target, iterateKey);
	let cache = members.get(receiver);
	if (!cache) members.set(receiver, (cache = new WeakMap()));
	let bound = cache.get(method);
	if (bound) return bound;
	bound = (...args) => {
		if (options.readonly) return wrap(readonlyArrayCall(target, method, args, receiver));
		const publish = captureCustomProperties(target);
		try {
			return wrap(mutateArray(target, String(key), method, args, receiver, options));
		} finally {
			publish();
		}
	};
	cache.set(method, bound);
	return bound;
}

/** Isolates authored-accessor callbacks from ordinary data-property writes. */
export function writeProxyAccessor(
	target: object,
	key: PropertyKey,
	next: unknown,
	receiver: object,
	{ options, collectionMember }: ReactiveProxyRecord
): boolean {
	return writeAccessor(target, key, unwrap(next), receiver, options, (operation) =>
		collectionMember!(
			target as Map<unknown, unknown> | Set<unknown>,
			key,
			receiver,
			options,
			(value) => value,
			operation
		)
	);
}

/** Invokes an accessor without a comparison getter and retains native collection receivers. */
export function writeAccessor(
	target: object,
	key: PropertyKey,
	next: unknown,
	receiver: object,
	options: ReactiveOptions,
	invokeCollection?: (operation: () => unknown) => unknown
): boolean {
	if (target instanceof Map || target instanceof Set) {
		return invokeCollection!(() => Reflect.set(target, key, next, target)) as boolean;
	}
	if (!Array.isArray(target)) return Reflect.set(target, key, next, receiver);
	const publish = captureCustomProperties(target);
	try {
		return mutateArray(
			target,
			String(key),
			() => Reflect.set(target, key, next, target),
			[],
			receiver,
			options
		) as boolean;
	} finally {
		publish();
	}
}

// Authored readonly methods may inspect private fields. Restore observable slots if they mutate.
function readonlyArrayCall(
	target: unknown[],
	method: Member,
	args: unknown[],
	receiver: object
): unknown {
	const previous = new Map(
		Reflect.ownKeys(target).map((key) => [key, Reflect.getOwnPropertyDescriptor(target, key)!])
	);
	let result: unknown;
	try {
		result = Reflect.apply(method, target, args);
	} finally {
		let changed = false;
		for (const key of new Set([...previous.keys(), ...Reflect.ownKeys(target)])) {
			const next = Reflect.getOwnPropertyDescriptor(target, key);
			if (next ? samePropertyDescriptor(previous.get(key), next) : !previous.has(key)) continue;
			changed = true;
			const descriptor = previous.get(key);
			if (descriptor) Reflect.defineProperty(target, key, descriptor);
			else Reflect.deleteProperty(target, key);
		}
		if (changed) throw new TypeError('Cannot mutate a readonly reactive array');
	}
	return result === target ? receiver : result;
}
