import { isNativeAccessor } from '../internal/native-operations.js';
import { unwrap } from '../internal/values.js';
import { applyNativeReactiveCollection } from '../proxy/collection-publication.js';
import { wrapReactiveCollectionValue } from '../proxy/create-base.js';
import type { PendingCollectionDelta } from './collection-deltas.js';

/** Distinguishes native membership from an authored getter that happens to be named size. */
export function isPendingNativeCollectionSize(
	target: object,
	key: PropertyKey,
	getter: unknown
): boolean {
	return (
		key === 'size' &&
		(target instanceof Map
			? isNativeAccessor('map', key, getter)
			: target instanceof Set && isNativeAccessor('set', key, getter))
	);
}

/** Supplies an explicit invocation's storage and publication policy to native collection algorithms. */
export interface PendingCollectionContext {
	/** Selects committed storage once publication begins. */
	readonly publishing: boolean;
	/** Rejects work whose owner has lost its transaction lifetime. */
	assertCurrent(): void;
	/** Checks the selected receiver alias before a mutator runs. */
	checkCollectionWrite(target: object, key: PropertyKey): void;
	/** Retrieves or creates a lazy per-key delta without copying collection storage. */
	collection(raw: Map<unknown, unknown> | Set<unknown>): PendingCollectionDelta;
	/** Resolves a pending source to the retained published receiver. */
	publishedReceiver(target: object): object;
	/** Retains returned objects as invocation-owned values. */
	retain(value: unknown): unknown;
	/** Captures an already selected native operation in the host's publication order. */
	stageCollectionWrite(target: object, key: PropertyKey, args: unknown[]): void;
}

/** Evaluates native Map and Set methods against lazy deltas, preserving native results and callback receivers. */
export function applyPendingNativeCollection(
	context: PendingCollectionContext,
	target: object,
	raw: Map<unknown, unknown> | Set<unknown>,
	key: PropertyKey,
	native: (...args: unknown[]) => unknown,
	args: unknown[]
): unknown {
	context.assertCurrent();
	if (['set', 'add', 'get', 'has', 'delete'].includes(String(key))) {
		args = [unwrap(args[0]), ...args.slice(1)];
	}
	if (context.publishing)
		return applyNativeReactiveCollection(context.publishedReceiver(target), key, args);
	const delta = context.collection(raw);
	const mutation = key === 'set' || key === 'add' || key === 'delete' || key === 'clear';
	if (mutation) {
		context.checkCollectionWrite(target, key);
		let result: unknown;
		if (key === 'set') {
			delta.set(args[0], args[1]);
			result = target;
		} else if (key === 'add') {
			delta.set(args[0], args[0]);
			result = target;
		} else if (key === 'delete') result = delta.delete(args[0]);
		else delta.clear();
		context.stageCollectionWrite(target, key, args);
		return result;
	}
	if (key === 'get')
		return context.retain(
			delta.hasPending(args[0])
				? delta.get(args[0])
				: applyNativeReactiveCollection(target, key, args)
		);
	if (key === 'has') return delta.has(args[0]);
	if (key === 'keys' || key === 'values' || key === 'entries' || key === Symbol.iterator) {
		const entries = delta.iterate((value) =>
			context.retain(wrapReactiveCollectionValue(target, value))
		);
		return (function* () {
			while (true) {
				// Pending cursors belong to this journal. A closed delta cannot safely resume
				// against reconciled storage while retaining its former insertion cursor.
				context.assertCurrent();
				const next = entries.next();
				if (next.done) return;
				const [entryKey, value] = next.value;
				yield key === 'keys'
					? entryKey
					: key === 'values' || (key === Symbol.iterator && raw instanceof Set)
						? value
						: [entryKey, value];
			}
		})();
	}
	if (key === 'forEach') {
		if (typeof args[0] !== 'function') throw new TypeError('Expected a collection callback');
		for (const [entryKey, value] of delta.iterate((entry) =>
			context.retain(wrapReactiveCollectionValue(target, entry))
		))
			Reflect.apply(args[0], args[1], [value, raw instanceof Set ? value : entryKey, target]);
		return undefined;
	}
	return Reflect.apply(native, raw, args);
}
