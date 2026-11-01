import {
	retainArrayPropertyPositions,
	arrayPositionSlots,
	arrayPosition,
	arrayPositionKey,
	hasArrayPositions,
	type ArrayLengthGeometry
} from '../arrays/positions.js';
import { createPropertyUndo, truncatedArrayIndexes } from '../arrays/mutation.js';
import {
	hasActiveTransaction,
	recordTransactionUndo,
	trigger,
	readMutationVersion,
	readOwnershipVersion,
	notifyReactiveDependency
} from '../internal/deps.js';
import { markReactiveHashDirty } from '../internal/keyed-collections.js';
import { notifyMutation } from '../internal/mutation-observation.js';
import { isArrayStructureKey } from '../internal/objects.js';
import { readArrayOrderVersion } from '../arrays/reordering.js';
import { arrayLengthWriteKey, iterateKey } from '../internal/symbols.js';
import { unwrap } from '../internal/values.js';
import type { ReactiveProxyRecord } from './capabilities.js';
import {
	normalizeDescriptor,
	propertyDescriptor,
	samePropertyDescriptor
} from './property-descriptors.js';
import { writeProxyAccessor } from './subclass-members.js';

type ReactivePropertyHandler = { record: ReactiveProxyRecord };

/** Applies native property mutations before publishing dependencies and inverse ownership. */
export const reactivePropertyTraps: Pick<
	ProxyHandler<object>,
	'set' | 'defineProperty' | 'deleteProperty'
> = {
	set(
		this: ReactivePropertyHandler,
		target: object,
		key: PropertyKey,
		next: unknown,
		receiver: object
	): boolean {
		const { options } = this.record;

		const previousLength = Array.isArray(target) ? target.length : undefined;
		const removedIndexes =
			Array.isArray(target) && key === 'length' && typeof next === 'number' && next < target.length
				? truncatedArrayIndexes(target, next)
				: undefined;
		const descriptor = propertyDescriptor(target, key);
		if (descriptor && !('value' in descriptor)) {
			const ok = writeProxyAccessor(target, key, next, receiver, this.record);
			if (ok) {
				markReactiveHashDirty(target);
				trigger(target, key);
			}
			return ok;
		}
		// A different receiver owns ordinary data writes and must retain the supplied value's identity.
		const alternateReceiver = receiver !== this.record.proxy && receiver !== target;
		const originalOwnDescriptor = alternateReceiver
			? Reflect.getOwnPropertyDescriptor(target, key)
			: undefined;
		const previous = Reflect.get(target, key, receiver);
		const unwrapped = alternateReceiver ? next : unwrap(next);
		const hadKey = Object.prototype.hasOwnProperty.call(target, key);
		const changed = !Object.is(unwrap(previous), unwrap(unwrapped));
		if (!changed) {
			const ownDescriptor = Reflect.getOwnPropertyDescriptor(target, key);
			if (
				receiver === this.record.proxy &&
				ownDescriptor &&
				'value' in ownDescriptor &&
				ownDescriptor.writable
			) {
				if (Array.isArray(target) && key === 'length') trigger(target, arrayLengthWriteKey);
				return true;
			}
		}
		const undo = hasActiveTransaction() ? createPropertyUndo(target, key) : undefined;
		this.record.forwardingSet = true;
		let ok: boolean;
		try {
			ok = Reflect.set(target, key, unwrapped, receiver);
		} finally {
			this.record.forwardingSet = false;
		}

		if (
			ok &&
			alternateReceiver &&
			samePropertyDescriptor(
				originalOwnDescriptor,
				Reflect.getOwnPropertyDescriptor(target, key)
			) &&
			Object.is(previous, Reflect.get(target, key, receiver))
		)
			return true;
		const detached =
			ok && previousLength !== undefined
				? retainArrayPropertyPositions(
						target as unknown[],
						key,
						previousLength,
						key === 'length'
							? acquireLengthGeometry(target as unknown[], previousLength)
							: undefined
					)
				: [];
		for (const slot of detached) trigger(slot.position, arrayPositionKey);
		const detachedIndexes = detached.length
			? new Set(detached.map((slot) => String(slot.index)))
			: undefined;
		// An accepted explicit length assignment fences older inverses even when its value is equal.
		if (ok && Array.isArray(target) && key === 'length') trigger(target, arrayLengthWriteKey);
		if (ok && undo && (!hadKey || !Object.is(previous, Reflect.get(target, key, receiver))))
			recordTransactionUndo(
				undo,
				Array.isArray(target) && key === 'length' ? undefined : target,
				key
			);
		// Creating an own key changes structure even when its inherited or missing value is unchanged.
		if (ok && (changed || !hadKey)) {
			markReactiveHashDirty(target);
			trigger(target, key);
			if (removedIndexes)
				for (const index of removedIndexes) {
					if (detachedIndexes?.has(String(index))) notifyReactiveDependency(target, String(index));
					else trigger(target, String(index));
				}
			if (
				previousLength !== undefined &&
				Array.isArray(target) &&
				target.length !== previousLength &&
				key !== 'length'
			)
				trigger(target, 'length');
			if (!hadKey || isArrayStructureKey(target, key)) trigger(target, iterateKey);
			notifyMutation(options, key, 'set');
		}
		return ok;
	},

	defineProperty(
		this: ReactivePropertyHandler,
		target: object,
		key: PropertyKey,
		descriptor: PropertyDescriptor
	): boolean {
		const { options } = this.record;
		if (this.record.forwardingSet) return Reflect.defineProperty(target, key, descriptor);
		const previous = Reflect.getOwnPropertyDescriptor(target, key);
		if (samePropertyDescriptor(previous, descriptor)) {
			if (Array.isArray(target) && key === 'length' && 'value' in descriptor)
				trigger(target, arrayLengthWriteKey);
			return true;
		}
		const undo = hasActiveTransaction() ? createPropertyUndo(target, key) : undefined;
		const oldLength = Array.isArray(target) ? target.length : undefined;
		const previousIndexes =
			Array.isArray(target) && key === 'length' ? Object.keys(target) : undefined;
		const ok = Reflect.defineProperty(target, key, normalizeDescriptor(descriptor, previous));
		if (!ok) return false;
		const detached =
			oldLength !== undefined
				? retainArrayPropertyPositions(
						target as unknown[],
						key,
						oldLength,
						key === 'length' ? acquireLengthGeometry(target as unknown[], oldLength) : undefined
					)
				: [];
		for (const slot of detached) trigger(slot.position, arrayPositionKey);
		const detachedIndexes = detached.length
			? new Set(detached.map((slot) => String(slot.index)))
			: undefined;
		if (Array.isArray(target) && key === 'length') {
			trigger(target, arrayLengthWriteKey);
			for (const index of previousIndexes ?? [])
				if (!Reflect.has(target, index)) {
					if (detachedIndexes?.has(index)) notifyReactiveDependency(target, index);
					else trigger(target, index);
				}
		}
		if (undo)
			recordTransactionUndo(
				undo,
				Array.isArray(target) && key === 'length' ? undefined : target,
				key
			);
		markReactiveHashDirty(target);
		trigger(target, key);
		if (
			!previous ||
			isArrayStructureKey(target, key) ||
			('enumerable' in descriptor && descriptor.enumerable !== previous.enumerable)
		)
			trigger(target, iterateKey);
		if (oldLength !== undefined && (target as unknown[]).length !== oldLength && key !== 'length')
			trigger(target, 'length');
		notifyMutation(options, key, 'define');
		return true;
	},

	deleteProperty(this: ReactivePropertyHandler, target: object, key: PropertyKey): boolean {
		const { options } = this.record;

		const hadKey = Object.prototype.hasOwnProperty.call(target, key);
		const undo = hadKey && hasActiveTransaction() ? createPropertyUndo(target, key) : undefined;
		const ok = Reflect.deleteProperty(target, key);
		if (ok && hadKey) {
			if (undo) recordTransactionUndo(undo, target, key);
			markReactiveHashDirty(target);
			trigger(target, key);
			trigger(target, iterateKey);
			notifyMutation(options, key, 'delete');
		}
		return ok;
	}
};

/** Acquires the existing postwrite length read before ownership notification can resolve new slots.
 * Returned original addresses retain numeric observation delivery without phantom replacements.
 */
function acquireLengthGeometry(
	array: unknown[],
	previousLength: number
): ArrayLengthGeometry | undefined {
	if (!hasArrayPositions(array)) return undefined;
	const slots = arrayPositionSlots(array, previousLength);
	const owners = slots.map((slot) => readOwnershipVersion(slot.position, arrayPositionKey));
	const signal = () => [
		readMutationVersion(array, iterateKey),
		readArrayOrderVersion(array),
		readMutationVersion(array, 'length'),
		readMutationVersion(array, arrayLengthWriteKey)
	];
	const before = signal();
	const length = array.length;
	const stable =
		signal().every((value, index) => value === before[index]) &&
		slots.every(
			(slot, index) =>
				slot.position.index === slot.index &&
				arrayPosition(array, slot.index, false) === slot.position &&
				readOwnershipVersion(slot.position, arrayPositionKey) === owners[index]
		);
	return { length, stable, slots };
}
