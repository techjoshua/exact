import { hasActiveTransaction, recordTransactionUndo, trigger } from '../internal/deps.js';
import { createPropertyUndo, arrayIndex } from '../arrays/property-undo.js';
import { samePropertyDescriptor } from './property-descriptors.js';
import { iterateKey } from '../internal/symbols.js';

/** Captures public fields before a raw receiver call and publishes field and own-key changes. */
export function captureCustomProperties(target: object): () => boolean {
	const previous = new Map<PropertyKey, PropertyDescriptor>();
	const undo = new Map<PropertyKey, ReturnType<typeof createPropertyUndo>>();
	for (const key of Reflect.ownKeys(target)) {
		if (Array.isArray(target) && (key === 'length' || arrayIndex(key) !== undefined)) continue;
		previous.set(key, Reflect.getOwnPropertyDescriptor(target, key)!);
		if (hasActiveTransaction()) undo.set(key, createPropertyUndo(target, key));
	}
	return () => {
		let changed = false;
		for (const key of new Set([...previous.keys(), ...Reflect.ownKeys(target)])) {
			if (Array.isArray(target) && (key === 'length' || arrayIndex(key) !== undefined)) continue;
			const next = Reflect.getOwnPropertyDescriptor(target, key);
			if (next ? samePropertyDescriptor(previous.get(key), next) : !previous.has(key)) continue;
			changed = true;
			if (hasActiveTransaction())
				recordTransactionUndo(
					undo.get(key) ??
						(() => {
							return Reflect.deleteProperty(target, key);
						}),
					target,
					key
				);
			trigger(target, key);
		}
		// Own-property enumeration has a separate dependency from native Map/Set entry iteration.
		if (changed) trigger(target, iterateKey);
		return changed;
	};
}
