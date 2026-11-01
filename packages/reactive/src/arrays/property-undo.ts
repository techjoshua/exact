import {
	arrayIndex,
	arrayPosition,
	arrayPositionKey,
	isArrayPosition,
	arrayPropertyAddress,
	isUsableArrayPosition,
	arrayPositionSlots,
	restoreArrayPosition,
	refuseArrayPositions
} from './positions.js';
export { arrayIndex } from './positions.js';
import {
	readOwnershipVersion,
	readMutationVersion,
	type MutationRestoration
} from '../internal/deps.js';
import { readArrayOrderVersion } from './reordering.js';
import { arrayLengthWriteKey, iterateKey } from '../internal/symbols.js';

/**
 * Captures a descriptor before mutation, binding its moved array slot only when the journal records it.
 * Preparation cannot allocate a phantom address for a refused write or a write owned by another receiver.
 * Ordinary index writes do not take ownership of array length.
 */
export function createPropertyUndo(
	target: object,
	key: PropertyKey
): (restoration: MutationRestoration, location?: object) => boolean {
	if (Array.isArray(target) && key === 'length') return createArrayLengthUndo(target);
	const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
	const array = Array.isArray(target) ? target : undefined;
	const index = array ? arrayIndex(key) : undefined;
	const oldLength = array?.length ?? 0;
	const lengthVersion = array ? readOwnershipVersion(array, arrayLengthWriteKey) : 0;
	return (restoration, location) => {
		const position = location && isArrayPosition(location) ? location : undefined;
		const currentKey = position ? String(position.index) : key;
		if (position && position.index < 0) return false;
		const currentIndex = position?.index ?? index;
		const ownsLength = !array || restoration.allows(array, arrayLengthWriteKey, lengthVersion);
		if (array && currentIndex !== undefined && currentIndex >= array.length && !ownsLength)
			return false;
		const lengthReceipt = array ? restoration.capture(array, 'length') : undefined;
		const completed = descriptor
			? Reflect.defineProperty(target, currentKey, descriptor)
			: Reflect.deleteProperty(target, currentKey);
		if (!completed) return false;
		if (array && index !== undefined && index >= oldLength && ownsLength) {
			// Shrink only the extension created by this write, retaining all later populated slots.
			let retainedLength = oldLength;
			for (const name of Object.getOwnPropertyNames(array)) {
				const retainedIndex = arrayIndex(name);
				if (retainedIndex !== undefined)
					retainedLength = Math.max(retainedLength, retainedIndex + 1);
			}
			if (array.length > retainedLength) {
				array.length = retainedLength;
				restoration.mark(lengthReceipt!);
			}
		}
		return true;
	};
}

/** Captures descriptors only for rollback-capable length writes; surviving slots are never restored. */
function createArrayLengthUndo(target: unknown[]): (restoration: MutationRestoration) => boolean {
	const oldLength = target.length;
	const lengthVersion = readOwnershipVersion(target, arrayLengthWriteKey);
	if (oldLength) readOwnershipVersion(target, '0');
	const extentAddress = oldLength ? arrayPropertyAddress(target, '0') : undefined;
	const slots = Object.getOwnPropertyNames(target).flatMap((key) => {
		const index = arrayIndex(key);
		const version = index === undefined ? 0 : readOwnershipVersion(target, key);
		const address = arrayPropertyAddress(target, key);
		return index === undefined
			? []
			: [
					{
						key,
						index,
						descriptor: Reflect.getOwnPropertyDescriptor(target, key)!,
						version,
						address
					}
				];
	});
	const ownSlots = new Set(slots.map((slot) => slot.index));
	const anchors = arrayPositionSlots(target, oldLength).map((slot) => ({
		...slot,
		version: readOwnershipVersion(slot.position, arrayPositionKey)
	}));
	return (restoration) => {
		let interrupted = false;
		const refuse = () => {
			interrupted = true;
			refuseArrayPositions(anchors.map((slot) => slot.position));
		};
		const ownsLength =
			anchors.every((anchor) => isUsableArrayPosition(anchor.position)) &&
			(!extentAddress ||
				!isArrayPosition(extentAddress.target) ||
				isUsableArrayPosition(extentAddress.target)) &&
			slots.every(
				(slot) =>
					!isArrayPosition(slot.address.target) || isUsableArrayPosition(slot.address.target)
			) &&
			restoration.allows(target, arrayLengthWriteKey, lengthVersion);
		const lengthReceipt = restoration.capture(target, 'length');
		const intentReceipt = restoration.capture(target, arrayLengthWriteKey);
		const signal = () => [
			readMutationVersion(target, iterateKey),
			readArrayOrderVersion(target),
			readMutationVersion(target, 'length'),
			readMutationVersion(target, arrayLengthWriteKey)
		];
		const initialSignal = signal();
		const currentLength = target.length;
		if (signal().some((value, index) => value !== initialSignal[index])) {
			refuse();
			return false;
		}
		let extent = currentLength;
		if (ownsLength && currentLength < oldLength) {
			const before = signal();
			target.length = oldLength;
			extent = target.length;
			if (signal().some((value, index) => value !== before[index])) {
				refuse();
				return false;
			}
		}
		if (ownsLength)
			for (const anchor of anchors) {
				if (interrupted) return false;
				if (
					anchor.index >= extent ||
					!restoration.allows(anchor.position, arrayPositionKey, anchor.version)
				)
					continue;
				const destination = arrayPosition(target, anchor.index, false);
				if (anchor.position.index < 0 && !destination)
					restoreArrayPosition(anchor.position, anchor.index);
				if (
					!ownSlots.has(anchor.index) &&
					anchor.position.index === anchor.index &&
					arrayPosition(target, anchor.index, false) === anchor.position
				) {
					const receipt = restoration.capture(anchor.position, arrayPositionKey);
					const before = signal();
					try {
						if (!Reflect.getOwnPropertyDescriptor(target, String(anchor.index)))
							restoration.mark(receipt);
					} finally {
						if (signal().some((value, index) => value !== before[index])) refuse();
					}
				}
			}
		for (const slot of slots) {
			if (interrupted) return false;
			if (
				(!ownsLength && slot.index >= currentLength) ||
				!restoration.allows(slot.address.target, slot.address.key, slot.version)
			)
				continue;
			const receipt = restoration.capture(slot.address.target, slot.address.key);
			const before = signal();
			try {
				const current = Reflect.getOwnPropertyDescriptor(target, slot.key);
				if (current && Object.is(current.value, slot.descriptor.value)) continue;
				// Metadata acquisition is authored code too. Keep the original address and reject moved slots.
				if (
					readOwnershipVersion(receipt.target, receipt.key) !== receipt.expected ||
					(isArrayPosition(receipt.target) &&
						(receipt.target.index !== slot.index ||
							arrayPosition(target, slot.index, false) !== receipt.target))
				)
					continue;
				if (Reflect.defineProperty(target, slot.key, slot.descriptor)) restoration.mark(receipt);
			} finally {
				if (signal().some((value, index) => value !== before[index])) refuse();
			}
		}
		if (interrupted) return false;
		if (ownsLength && target.length > oldLength) {
			// An optimistic extension owns empty tail slots, not later appended values.
			let retainedLength = oldLength;
			for (const key of Object.getOwnPropertyNames(target)) {
				const index = arrayIndex(key);
				if (index !== undefined) retainedLength = Math.max(retainedLength, index + 1);
			}
			target.length = retainedLength;
		}
		if (target.length !== currentLength) restoration.mark(lengthReceipt);
		if (ownsLength) restoration.mark(intentReceipt);
		return true;
	};
}
