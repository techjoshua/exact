import { hasActiveTransaction, recordTransactionUndo, trigger } from '../internal/deps.js';
import { createPropertyUndo, arrayIndex } from '../arrays/property-undo.js';
import { samePropertyDescriptor } from './property-descriptors.js';

/** Captures public subclass properties before a raw receiver call and publishes their changes. */
export function captureCustomProperties(target: object): (readonly?: boolean) => boolean {
	const previous = new Map<PropertyKey, PropertyDescriptor>();
	const undo = new Map<PropertyKey, ReturnType<typeof createPropertyUndo>>();
	for (const key of Reflect.ownKeys(target)) {
		if (Array.isArray(target) && (key === 'length' || arrayIndex(key) !== undefined)) continue;
		previous.set(key, Reflect.getOwnPropertyDescriptor(target, key)!);
		if (hasActiveTransaction()) undo.set(key, createPropertyUndo(target, key));
	}
	return (readonly = false) => {
		let changed = false;
		for (const key of new Set([...previous.keys(), ...Reflect.ownKeys(target)])) {
			if (Array.isArray(target) && (key === 'length' || arrayIndex(key) !== undefined)) continue;
			const next = Reflect.getOwnPropertyDescriptor(target, key);
			if (next ? samePropertyDescriptor(previous.get(key), next) : !previous.has(key)) continue;
			changed = true;
			if (readonly) {
				const descriptor = previous.get(key);
				if (descriptor) Reflect.defineProperty(target, key, descriptor);
				else Reflect.deleteProperty(target, key);
				continue;
			}
			if (hasActiveTransaction())
				recordTransactionUndo(
					undo.get(key) ??
						(() => {
							Reflect.deleteProperty(target, key);
						}),
					target,
					key
				);
			trigger(target, key);
		}
		if (readonly && changed) throw new TypeError('Cannot mutate readonly reactive properties');
		return changed;
	};
}
