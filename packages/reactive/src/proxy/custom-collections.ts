import {
	batch,
	hasActiveTransaction,
	recordTransactionUndo,
	track,
	trigger
} from '../internal/deps.js';
import type { ReactiveOptions } from '../internal/types.js';
import { captureCustomProperties } from './custom-member-properties.js';

type Collection = Map<unknown, unknown> | Set<unknown>;
type Member = (...args: unknown[]) => unknown;
const methods = new WeakMap<object, WeakMap<Member, Member>>();

/** Invokes an authored subclass method with its native brand and observes native storage changes. */
export function customCollectionMethod(
	target: Collection,
	receiver: object,
	method: Member,
	options: ReactiveOptions,
	dependency: (key: unknown) => PropertyKey,
	iterate: PropertyKey,
	size: PropertyKey,
	wrap: (value: unknown) => unknown
): Member {
	let cache = methods.get(receiver);
	if (!cache) methods.set(receiver, (cache = new WeakMap()));
	let bound = cache.get(method);
	if (bound) return bound;
	bound = (...args) => {
		track(target, iterate);
		const previous = snapshot(target);
		const publishProperties = captureCustomProperties(target);
		let result: unknown;
		try {
			result = Reflect.apply(method, target, args);
		} finally {
			const next = snapshot(target);
			const oldKeys = [...previous.keys()];
			const nextKeys = [...next.keys()];
			const oldPositions = new Map(oldKeys.map((key, index) => [key, index]));
			const positions = new Map(nextKeys.map((key, index) => [key, index]));
			const changed = [...new Set([...oldKeys, ...nextKeys])].filter(
				(key) =>
					previous.has(key) !== next.has(key) ||
					!Object.is(previous.get(key), next.get(key)) ||
					oldPositions.get(key) !== positions.get(key)
			);
			if (changed.length && options.readonly) {
				restore(target, previous);
				options.onReadonlyWrite?.('custom collection method');
				publishProperties(true);
				throw new TypeError('Cannot mutate a readonly reactive collection');
			}
			batch(() => {
				const propertiesChanged = publishProperties(options.readonly);
				for (const key of changed) {
					if (hasActiveTransaction()) {
						const position = oldPositions.get(key) ?? oldKeys.length;
						recordTransactionUndo(
							() => {
								const current = snapshot(target);
								current.delete(key);
								if (previous.has(key)) {
									const entries = [...current];
									const before = entries.findIndex(
										([entry]) => (oldPositions.get(entry) ?? -1) > position
									);
									entries.splice(before < 0 ? entries.length : before, 0, [key, previous.get(key)]);
									restore(target, new Map(entries));
								} else remove(target, key);
							},
							target,
							dependency(key)
						);
					}
					trigger(target, dependency(key));
				}
				if (changed.length || propertiesChanged) {
					trigger(target, iterate);
					if (previous.size !== next.size) trigger(target, size);
					try {
						options.onMutation?.(undefined, 'custom collection method');
					} catch {
						/* Inspection cannot change authored method behavior. */
					}
				}
			});
		}
		return result === target ? receiver : wrap(result);
	};
	cache.set(method, bound);
	return bound;
}

function snapshot(target: Collection): Map<unknown, unknown> {
	return target instanceof Map
		? new Map(Map.prototype.entries.call(target))
		: new Map([...Set.prototype.values.call(target)].map((value) => [value, value]));
}

function remove(target: Collection, key: unknown): void {
	if (target instanceof Map) Map.prototype.delete.call(target, key);
	else Set.prototype.delete.call(target, key);
}

function restore(target: Collection, entries: Map<unknown, unknown>): void {
	if (target instanceof Map) {
		Map.prototype.clear.call(target);
		for (const [key, value] of entries) Map.prototype.set.call(target, key, value);
	} else {
		Set.prototype.clear.call(target);
		for (const key of entries.keys()) Set.prototype.add.call(target, key);
	}
}
