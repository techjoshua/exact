import { readMutationVersion, type MutationRestoration } from './internal/deps.js';
import { arrayLengthWriteKey } from './internal/symbols.js';

/** Captures a property inverse without giving an ordinary index write ownership of array length. */
export function createPropertyUndo(
	target: object,
	key: PropertyKey
): (restoration: MutationRestoration) => void {
	if (Array.isArray(target) && key === 'length') return createArrayLengthUndo(target);
	const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
	const array = Array.isArray(target) ? target : undefined;
	const index = array ? arrayIndex(key) : undefined;
	const oldLength = array?.length ?? 0;
	const lengthVersion = array ? readMutationVersion(array, arrayLengthWriteKey) : 0;
	return (restoration) => {
		const ownsLength = !array || restoration.allows(array, arrayLengthWriteKey, lengthVersion);
		if (array && index !== undefined && index >= array.length && !ownsLength) return;
		if (descriptor) Reflect.defineProperty(target, key, descriptor);
		else Reflect.deleteProperty(target, key);
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
				restoration.mark(array, 'length');
			}
		}
	};
}

/** Captures descriptors only for rollback-capable length writes; surviving slots are never restored. */
function createArrayLengthUndo(target: unknown[]): (restoration: MutationRestoration) => void {
	const oldLength = target.length;
	const lengthVersion = readMutationVersion(target, arrayLengthWriteKey);
	const slots = Object.getOwnPropertyNames(target).flatMap((key) => {
		const index = arrayIndex(key);
		return index === undefined
			? []
			: [
					{
						key,
						index,
						descriptor: Reflect.getOwnPropertyDescriptor(target, key)!,
						version: readMutationVersion(target, key)
					}
				];
	});
	return (restoration) => {
		const ownsLength = restoration.allows(target, arrayLengthWriteKey, lengthVersion);
		const currentLength = target.length;
		if (ownsLength && currentLength < oldLength) target.length = oldLength;
		for (const slot of slots) {
			if (
				(!ownsLength && slot.index >= currentLength) ||
				!restoration.allows(target, slot.key, slot.version)
			)
				continue;
			const current = Reflect.getOwnPropertyDescriptor(target, slot.key);
			if (current && Object.is(current.value, slot.descriptor.value)) continue;
			Reflect.defineProperty(target, slot.key, slot.descriptor);
			restoration.mark(target, slot.key);
		}
		if (ownsLength && target.length > oldLength) {
			// An optimistic extension owns empty tail slots, not later appended values.
			let retainedLength = oldLength;
			for (const key of Object.getOwnPropertyNames(target)) {
				const index = arrayIndex(key);
				if (index !== undefined) retainedLength = Math.max(retainedLength, index + 1);
			}
			target.length = retainedLength;
		}
		if (target.length !== currentLength) restoration.mark(target, 'length');
	};
}

/** Recognizes actual array indices, excluding numeric-looking object properties and length itself. */
export function arrayIndex(key: PropertyKey): number | undefined {
	if (typeof key === 'symbol' || key === '') return undefined;
	const index = Number(key);
	return Number.isInteger(index) &&
		index >= 0 &&
		index < 0xffff_ffff &&
		String(index) === String(key)
		? index
		: undefined;
}
