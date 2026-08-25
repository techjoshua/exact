import { batch, trigger } from './internal/deps.js';

import {
	adoptKeyedCollectionMetadata,
	keyedCollectionMetadata,
	markReactiveHashDirty,
	seedKeyedCollectionMetadata
} from './internal/keyed-collections.js';

import { isArrayStructureKey, isPlainObject } from './internal/objects.js';

import { iterateKey, rawTarget } from './internal/symbols.js';

import { isReactive, unwrap } from './internal/values.js';

import type { Reactive } from './internal/types.js';

import { recordArrayUndo, recordPropertyUndo } from './array-mutation.js';

import { hasChanged, reactiveValueChanged } from './change-detection.js';

import { listKeyExtractors, reactiveRawObjects } from './proxy/state.js';
import { updateIndexedReactive } from './indexed-base.js';

/** Mutates an existing reactive object to match a partial next value while preserving nested proxies. */
export function updateReactive<T extends object>(target: Reactive<T>, next: Partial<T>): void {
	if (
		updateIndexedReactive(
			target,
			next as Record<PropertyKey, unknown>,
			(previous, value) => {
				if (!canUpdateNestedReactive(previous, value)) return false;
				updateReactive(previous as object, unwrap(value) as Partial<object>);
				return true;
			}
		)
	)
		return;
	const raw = isReactive(target) ? (target as { [rawTarget]: T })[rawTarget] : target;
	const nextRecord = next as Record<PropertyKey, unknown>;

	batch(() => {
		for (const key of Reflect.ownKeys(raw)) {
			if (!Object.prototype.hasOwnProperty.call(nextRecord, key)) {
				const hadKey = Object.prototype.hasOwnProperty.call(raw, key);
				if (hadKey) {
					recordPropertyUndo(raw, key);
					Reflect.deleteProperty(raw, key);
					markReactiveHashDirty(raw);
					trigger(raw, key);
					trigger(raw, iterateKey);
				}
			}
		}

		for (const key of Reflect.ownKeys(next)) {
			const previous = Reflect.get(raw, key);
			const value = Reflect.get(next, key);
			const hadKey = Object.prototype.hasOwnProperty.call(raw, key);
			if (canUpdateNestedReactive(previous, value)) {
				updateReactive(previous as object, unwrap(value) as Partial<object>);
				continue;
			}
			if (!reactiveValueChanged(previous, value) && !hasChanged(previous, value)) continue;
			recordPropertyUndo(raw, key);
			Reflect.set(raw, key, value);
			markReactiveHashDirty(raw);
			trigger(raw, key);
			if (!hadKey || isArrayStructureKey(raw, key)) trigger(raw, iterateKey);
		}
	});
}

function canUpdateNestedReactive(previous: unknown, next: unknown): boolean {
	const unwrappedPrevious = unwrap(previous);
	const unwrappedNext = unwrap(next);
	if (Object.is(unwrappedPrevious, unwrappedNext)) return false;
	return (
		(isReactive(previous) ||
			(!!unwrappedPrevious &&
				typeof unwrappedPrevious === 'object' &&
				reactiveRawObjects.has(unwrappedPrevious))) &&
		isPlainObject(unwrappedPrevious) &&
		isPlainObject(unwrappedNext)
	);
}

/** Resolves a reactive path. */
export function resolveReactivePath(
	target: object,
	path: readonly PropertyKey[]
): { parent: object; key: PropertyKey } {
	let parent = target as Record<PropertyKey, unknown>;
	for (let index = 0; index < path.length - 1; index++) {
		const next = parent[path[index]!];
		if (!next || typeof next !== 'object')
			throw new TypeError(`Cannot resolve reactive state path ${path.join('.')}`);
		parent = next as Record<PropertyKey, unknown>;
	}
	return { parent, key: path[path.length - 1]! };
}

/** Returns true when a compatible structured value was reconciled in place. */
export function reconcileReactiveValue(
	previous: unknown,
	next: unknown,
	seen: ReconcilePairs,
	depth = 0
): boolean {
	// Deep payloads fall back to replacing the remaining subtree. This keeps
	// writes stack-safe without discarding reconciliation already completed above it.
	if (depth > 100) return false;
	const oldValue = unwrap(previous);
	const nextValue = unwrap(next);
	if (Object.is(oldValue, nextValue)) return true;
	if (!oldValue || !nextValue || typeof oldValue !== 'object' || typeof nextValue !== 'object')
		return false;
	const compatible =
		Array.isArray(oldValue) && Array.isArray(nextValue)
			? Object.getPrototypeOf(oldValue) === Object.getPrototypeOf(nextValue) &&
				canReconcileStructure(oldValue) &&
				canReadStructure(nextValue)
			: isPlainObject(oldValue) &&
				isPlainObject(nextValue) &&
				Object.getPrototypeOf(oldValue) === Object.getPrototypeOf(nextValue) &&
				canReconcileStructure(oldValue) &&
				canReadStructure(nextValue);
	if (!compatible) return false;

	const priorNext = seen.oldToNext.get(oldValue);
	const priorOld = seen.nextToOld.get(nextValue);
	if (priorNext || priorOld) return priorNext === nextValue && priorOld === oldValue;
	seen.oldToNext.set(oldValue, nextValue);
	seen.nextToOld.set(nextValue, oldValue);

	const current = previous as Record<PropertyKey, unknown>;
	if (Array.isArray(oldValue) && Array.isArray(nextValue)) {
		const registration = listKeyExtractors.get(oldValue);
		if (registration)
			return reconcileKeyedArray(current, oldValue, nextValue, registration.key, seen, depth);
		const oldLength = oldValue.length;
		const previousItems = Array.from({ length: oldLength }, (_, index) =>
			Object.prototype.hasOwnProperty.call(current, index) ? current[index] : arrayHole
		);
		const existingByIdentity = new WeakMap<object, unknown>();
		for (const item of previousItems) {
			const identity = structuredIdentity(item);
			if (identity) existingByIdentity.set(identity, item);
		}
		const retainedIdentities = new WeakSet<object>();
		for (const incoming of nextValue) {
			const identity = structuredIdentity(incoming);
			if (identity && existingByIdentity.has(identity)) retainedIdentities.add(identity);
		}
		const nextItems = nextValue.map((incoming, index) => {
			const incomingIdentity = structuredIdentity(incoming);
			const retained = incomingIdentity ? existingByIdentity.get(incomingIdentity) : undefined;
			if (retained !== undefined) return retained;
			const previousItem = previousItems[index];
			if (previousItem === arrayHole) return incoming;
			const previousIdentity = structuredIdentity(previousItem);
			if (previousIdentity && retainedIdentities.has(previousIdentity)) return incoming;
			return previousItem !== undefined &&
				reconcileReactiveValue(previousItem, incoming, seen, depth + 1)
				? previousItem
				: incoming;
		});
		reconcileArrayItems(current, oldLength, nextItems);
		reconcileArrayProperties(current, oldValue, nextValue, seen, depth);
		return true;
	}

	const nextRecord = nextValue as Record<PropertyKey, unknown>;
	for (const key of Reflect.ownKeys(oldValue)) {
		if (!Object.prototype.hasOwnProperty.call(nextRecord, key))
			Reflect.deleteProperty(current, key);
	}
	for (const key of Reflect.ownKeys(nextRecord)) {
		const nextDescriptor = Reflect.getOwnPropertyDescriptor(nextRecord, key)!;
		const oldDescriptor = Reflect.getOwnPropertyDescriptor(oldValue, key);
		if (!('value' in nextDescriptor)) return false;
		if (
			!oldDescriptor ||
			!('value' in oldDescriptor) ||
			!reconcileReactiveValue(current[key], nextDescriptor.value, seen, depth + 1)
		) {
			// defineProperty treats __proto__ as an ordinary key and preserves the
			// incoming descriptor shape without prototype mutation.
			Reflect.defineProperty(current, key, {
				...nextDescriptor,
				value: unwrap(nextDescriptor.value)
			});
		}
	}
	return true;
}

type ReconcilePairs = {
	oldToNext: WeakMap<object, object>;
	nextToOld: WeakMap<object, object>;
};
const arrayHole = Symbol('exact.array-hole');

/** Creates a reconcile pairs. */
export function createReconcilePairs(): ReconcilePairs {
	return { oldToNext: new WeakMap(), nextToOld: new WeakMap() };
}

function reconcileArrayProperties(
	current: Record<PropertyKey, unknown>,
	oldValue: unknown[],
	nextValue: unknown[],
	seen: ReconcilePairs,
	depth: number
): void {
	const isExtra = (key: PropertyKey) =>
		key !== 'length' && !(typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key));
	for (const key of Reflect.ownKeys(oldValue)) {
		if (isExtra(key) && !Object.prototype.hasOwnProperty.call(nextValue, key))
			Reflect.deleteProperty(current, key);
	}
	for (const key of Reflect.ownKeys(nextValue)) {
		if (!isExtra(key)) continue;
		const nextDescriptor = Reflect.getOwnPropertyDescriptor(nextValue, key)!;
		const oldDescriptor = Reflect.getOwnPropertyDescriptor(oldValue, key);
		if (!('value' in nextDescriptor)) continue;
		if (
			!oldDescriptor ||
			!('value' in oldDescriptor) ||
			!reconcileReactiveValue(current[key], nextDescriptor.value, seen, depth + 1)
		) {
			Reflect.defineProperty(current, key, {
				...nextDescriptor,
				value: unwrap(nextDescriptor.value)
			});
		}
	}
}

function reconcileKeyedArray(
	current: Record<PropertyKey, unknown>,
	oldValue: unknown[],
	nextValue: unknown[],
	key: (item: unknown) => string,
	seen: ReconcilePairs,
	depth: number
): boolean {
	const previousMetadata = keyedCollectionMetadata(oldValue, key);
	const incomingMetadata = keyedCollectionMetadata(nextValue);
	if (
		previousMetadata &&
		incomingMetadata &&
		previousMetadata.itemsHash === incomingMetadata.itemsHash
	)
		return true;

	if (
		previousMetadata &&
		incomingMetadata &&
		previousMetadata.keyHash === incomingMetadata.keyHash
	) {
		const changedKeys = new Set<string>();
		for (let index = 0; index < nextValue.length; index++) {
			if (previousMetadata.itemHashes[index] === incomingMetadata.itemHashes[index]) continue;
			const id = incomingMetadata.keys[index]!;
			changedKeys.add(id);
			if (!reconcileReactiveValue(current[index], nextValue[index], seen, depth + 1))
				current[index] = nextValue[index];
		}
		adoptKeyedCollectionMetadata(oldValue, incomingMetadata, changedKeys);
		return true;
	}

	const existing = new Map<string, { item: unknown; index: number }>();
	for (let index = 0; index < oldValue.length; index++) {
		const id = String(key(oldValue[index]));
		if (existing.has(id))
			throw new Error(`Duplicate key "${id}" in the current keyed reactive array`);
		existing.set(id, { item: current[index], index });
	}
	const incomingEntries = nextValue.map((incoming) => ({ id: String(key(incoming)), incoming }));
	const keys = new Set<string>();
	for (const { id } of incomingEntries) {
		if (keys.has(id)) throw new Error(`Duplicate key "${id}" in the next keyed reactive array`);
		keys.add(id);
	}
	const nextItems: unknown[] = [];
	const changedKeys = new Set<string>();
	for (let index = 0; index < incomingEntries.length; index++) {
		const { id, incoming } = incomingEntries[index]!;
		const previousEntry = existing.get(id);
		const hashesMatch =
			previousEntry !== undefined &&
			previousMetadata !== undefined &&
			incomingMetadata !== undefined &&
			previousMetadata.itemHashes[previousEntry.index] === incomingMetadata.itemHashes[index];
		if (hashesMatch) nextItems.push(previousEntry!.item);
		else if (
			previousEntry !== undefined &&
			reconcileReactiveValue(previousEntry.item, incoming, seen, depth + 1)
		) {
			changedKeys.add(id);
			nextItems.push(previousEntry.item);
		} else {
			if (previousEntry !== undefined) changedKeys.add(id);
			nextItems.push(incoming);
		}
	}
	reconcileArrayItems(current, oldValue.length, nextItems);
	if (incomingMetadata) adoptKeyedCollectionMetadata(oldValue, incomingMetadata, changedKeys);
	else seedKeyedCollectionMetadata(oldValue, key);
	return true;
}

function structuredIdentity(value: unknown): object | undefined {
	const identity = unwrap(value);
	return identity && typeof identity === 'object' ? identity : undefined;
}

function reconcileArrayItems(
	current: Record<PropertyKey, unknown>,
	oldLength: number,
	nextItems: readonly unknown[]
): void {
	const target = unwrap(current) as unknown as unknown[];
	recordArrayUndo(target);
	const changedIndexes = new Set<number>();
	for (let index = 0; index < nextItems.length; index++) {
		if (!Reflect.has(nextItems, index)) {
			if (Reflect.has(target, index)) {
				Reflect.deleteProperty(target, index);
				changedIndexes.add(index);
			}
			continue;
		}
		const next = unwrap(nextItems[index]);
		if (Object.is(unwrap(target[index]), next)) continue;
		Reflect.set(target, index, next);
		changedIndexes.add(index);
	}
	if (nextItems.length < oldLength) {
		for (let index = oldLength - 1; index >= nextItems.length; index--) {
			if (Reflect.has(target, index)) changedIndexes.add(index);
			Reflect.deleteProperty(target, index);
		}
	}
	if (target.length !== nextItems.length) target.length = nextItems.length;

	// Reconciliation is one observable write. Notify only after the complete
	// array is valid so synchronous pre-patch hooks never see holes or aliases.
	for (const index of changedIndexes) trigger(target, String(index));
	if (oldLength !== nextItems.length) trigger(target, 'length');
	if (changedIndexes.size || oldLength !== nextItems.length) trigger(target, iterateKey);
}

function canReconcileStructure(value: object): boolean {
	if (!Object.isExtensible(value)) return false;
	return Reflect.ownKeys(value).every((key) => {
		if (Array.isArray(value) && key === 'length') return true;
		const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
		return (
			!!descriptor &&
			'value' in descriptor &&
			descriptor.writable !== false &&
			descriptor.configurable !== false
		);
	});
}

function canReadStructure(value: object): boolean {
	return Reflect.ownKeys(value).every((key) => {
		if (Array.isArray(value) && key === 'length') return true;
		const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
		return !!descriptor && 'value' in descriptor;
	});
}
