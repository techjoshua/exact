import { batch, trigger } from './internal/deps.js';

import { markReactiveHashDirty } from './internal/keyed-collections.js';

import { isArrayStructureKey, isPlainObject } from './internal/objects.js';

import { iterateKey, rawTarget } from './internal/symbols.js';

import { isReactive, unwrap } from './internal/values.js';

import type { Reactive } from './internal/types.js';

import { recordPropertyUndo } from './arrays/mutation.js';

import { hasChanged, reactiveValueChanged, reactiveSourceChanged } from './change-detection.js';

import { reactiveRawObjects } from './proxy/state.js';
import { updateIndexedReactive } from './indexed-base.js';
import { propertyDescriptor } from './proxy/property-descriptors.js';

/** Mutates an existing reactive object to match a partial next value while preserving nested proxies. */
export function updateReactive<T extends object>(target: Reactive<T>, next: Partial<T>): void {
	updateReactiveProperties(target, next, true);
}

/** Replaces top-level reactive properties without reconciling nested prop values in place. */
export function updateReactiveShallow<T extends object>(
	target: Reactive<T>,
	next: Partial<T>
): void {
	updateReactiveProperties(target, next, false);
}

function updateReactiveProperties<T extends object>(
	target: Reactive<T>,
	next: Partial<T>,
	reconcileNested: boolean
): void {
	if (
		updateIndexedReactive(target, next as Record<PropertyKey, unknown>, (previous, value) => {
			if (!reconcileNested || !canUpdateNestedReactive(previous, value)) return false;
			updateReactive(previous as object, unwrap(value) as Partial<object>);
			return true;
		})
	)
		return;
	const raw = isReactive(target) ? (target as { [rawTarget]: T })[rawTarget] : target;
	const nextRecord = next as Record<PropertyKey, unknown>;

	batch(() => {
		for (const key of Reflect.ownKeys(raw)) {
			if (Object.prototype.hasOwnProperty.call(nextRecord, key)) continue;
			recordPropertyUndo(raw, key);
			if (!Reflect.deleteProperty(raw, key))
				throw new TypeError(`Cannot delete reactive state property ${String(key)}`);
			markReactiveHashDirty(raw);
			trigger(raw, key);
			trigger(raw, iterateKey);
		}

		for (const key of Reflect.ownKeys(next)) {
			const descriptor = propertyDescriptor(raw, key);
			const accessor = descriptor && !('value' in descriptor);
			const previous = accessor ? undefined : Reflect.get(raw, key);
			const value = Reflect.get(next, key);
			const hadKey = Object.prototype.hasOwnProperty.call(raw, key);
			if (!accessor && reconcileNested && canUpdateNestedReactive(previous, value)) {
				updateReactive(previous as object, unwrap(value) as Partial<object>);
				continue;
			}
			if (
				!accessor &&
				hadKey &&
				!reactiveValueChanged(previous, value) &&
				!(!reconcileNested && reactiveSourceChanged(previous, value)) &&
				!hasChanged(previous, value)
			)
				continue;
			recordPropertyUndo(raw, key);
			if (!Reflect.set(raw, key, value, accessor ? target : raw))
				throw new TypeError(`Cannot assign reactive state property ${String(key)}`);
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
