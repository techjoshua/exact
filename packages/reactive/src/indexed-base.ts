import { indexedRecords, indexedRecord, type IndexedRecord } from './reactive-record-slots.js';
import { createPropertyUndo } from './arrays/property-undo.js';
import { markReactiveHashDirty } from './internal/keyed-collections.js';
import {
	requiresExactProxyValue,
	normalizeDescriptor,
	samePropertyDescriptor
} from './proxy/property-descriptors.js';
export {
	readReactiveOwnProperty,
	readReactiveOwnPropertyInto,
	type ReactiveOwnPropertyReadCell
} from './proxy/property-descriptors.js';
import { notifyMutation } from './internal/mutation-observation.js';
import {
	isCompiledPropOperand,
	readCompiledPropOperand,
	indexedSourceChanged
} from './internal/property-operand.js';
export {
	isCompiledReactivePropertyOperand,
	compiledReactivePropertyOperand,
	type CompiledReactivePropertyOperand
} from './internal/property-operand.js';
import {
	iterateKey,
	proxyMarker,
	rawTarget,
	reactiveProxyPolicy,
	reactiveValueMarker,
	reactiveValueRef
} from './internal/symbols.js';
import type { Reactive, ReactiveOptions, ReactiveRef, ReactiveValue } from './internal/types.js';
import {
	batch,
	hasActiveTransaction,
	peek,
	readMutationVersion,
	recordTransactionUndo,
	track,
	trigger
} from './internal/deps.js';
import { isReactiveContainer, reactiveSourceChanged } from './change-detection.js';
import { isReactiveValue, rejectReadonlyReactiveValueWrite, unwrap } from './internal/values.js';
import { indexedLayout } from './indexed-layout.js';
import {
	ensureIndexedRecordIndex,
	indexedRecordIndex,
	indexedRecordKey
} from './reactive-record-slots.js';

type IndexedProxyHandler = ProxyHandler<Record<PropertyKey, unknown>> & {
	record: IndexedRecord;
};

/**
 * Shared traps resolve instance-owned storage through each handler's record. Keeping the trap
 * methods module-local avoids retaining equivalent closures for every indexed state or props facade.
 */
const indexedProxyHandler: ProxyHandler<Record<PropertyKey, unknown>> = {
	get(this: IndexedProxyHandler, target, key, receiver) {
		if (key === proxyMarker) return true;
		if (key === rawTarget) return target;
		if (key === reactiveProxyPolicy) return this.record;
		const { record } = this;
		const index = indexedRecordIndex(record, key);
		if (index !== undefined) return readIndexedValue(record, key, index, 'facade', receiver);
		track(target, key);
		return Reflect.get(target, key, receiver);
	},
	set(this: IndexedProxyHandler, target, key, next, receiver) {
		const { record } = this;
		if (indexedRecords.get(receiver) !== record) return Reflect.set(target, key, next, receiver);
		const existing = indexedRecordIndex(record, key);
		if (existing === undefined && !Reflect.isExtensible(target) && !Object.hasOwn(target, key))
			return false;
		return writeIndexedRecord(
			record,
			existing ?? ensureIndexedRecordIndex(record, key),
			next,
			receiver
		);
	},
	defineProperty(this: IndexedProxyHandler, target, key, descriptor) {
		const previous = Reflect.getOwnPropertyDescriptor(target, key);
		if (samePropertyDescriptor(previous, descriptor)) return true;
		const undo = hasActiveTransaction() ? createPropertyUndo(target, key) : undefined;
		if (!Reflect.defineProperty(target, key, normalizeDescriptor(descriptor, previous)))
			return false;
		const index = ensureIndexedRecordIndex(this.record, key);
		if (undo) recordTransactionUndo(undo, target, index);
		publishIndexedMutation(
			this.record,
			index,
			key,
			'define',
			!previous || ('enumerable' in descriptor && descriptor.enumerable !== previous.enumerable)
		);
		return true;
	},
	ownKeys(this: IndexedProxyHandler, target) {
		track(target, iterateKey);
		return Reflect.ownKeys(target);
	},
	has(this: IndexedProxyHandler, target, key) {
		track(target, indexedRecordIndex(this.record, key) ?? key);
		return Reflect.has(target, key);
	},
	deleteProperty(this: IndexedProxyHandler, target, key) {
		const { record } = this;
		const index = indexedRecordIndex(record, key);
		return index === undefined
			? Reflect.deleteProperty(target, key)
			: deleteIndexedRecord(record, index);
	}
};

/**
 * Creates an inspectable object facade whose compiler-known top-level fields are
 * stored in stable numeric slots. Nested containers retain the general reactive
 * proxy so ordinary mutable objects, arrays, maps, and sets keep their semantics.
 */
export function createIndexedReactive<T extends object>(
	keys: readonly PropertyKey[],
	options: ReactiveOptions,
	wrap: (value: object, options: ReactiveOptions, parentSource?: ReactiveRef) => object,
	initial?: T,
	preserveReactiveValues = false
): Reactive<T> {
	const layout = indexedLayout(keys);
	const target: Record<PropertyKey, unknown> = {};
	const record: IndexedRecord = {
		layout,
		target,
		options,
		wrap,
		preserveReactiveValues
	};

	const handler = Object.create(indexedProxyHandler) as IndexedProxyHandler;
	handler.record = record;
	const facade = new Proxy(target, handler);
	indexedRecords.set(facade, record);
	if (initial) seedIndexedRecord(record, initial, facade);
	return facade as Reactive<T>;
}

/**
 * Reconciles a compiler-indexed facade while preserving numeric dependency identities.
 *
 * The caller owns batching and may reconcile compatible nested containers before this function
 * replaces a top-level slot. Returns false when the value is not an indexed facade.
 */
export function updateIndexedReactive(
	value: object,
	next: Record<PropertyKey, unknown>,
	reconcileNested: (previous: unknown, next: unknown) => boolean
): boolean {
	const indexed = indexedRecords.get(value);
	if (!indexed) return false;
	batch(() => {
		for (const key of Reflect.ownKeys(indexed.target)) {
			if (Object.prototype.hasOwnProperty.call(next, key)) continue;
			const index = indexedRecordIndex(indexed, key);
			if (index !== undefined && !deleteIndexedRecord(indexed, index))
				throw new TypeError(`Cannot delete indexed state property ${String(key)}`);
		}
		for (const key of Reflect.ownKeys(next)) {
			const incoming = Reflect.get(next, key);
			const index = ensureIndexedRecordIndex(indexed, key);
			const descriptor = Reflect.getOwnPropertyDescriptor(indexed.target, key);
			if (
				descriptor &&
				'value' in descriptor &&
				(Object.is(descriptor.value, incoming) || reconcileNested(descriptor.value, incoming))
			)
				continue;
			if (!writeIndexedRecord(indexed, index, incoming, value))
				throw new TypeError(`Cannot assign indexed state property ${String(key)}`);
		}
	});
	return true;
}

/** Reads one compiler-proven top-level slot without entering the facade's property trap. */
export function readIndexedReactiveSlot(value: object, index: number): unknown {
	const indexed = indexedRecord(value, index, 'read');
	return readIndexedValue(indexed, indexedRecordKey(indexed, index), index, 'direct', value);
}

/**
 * Creates a readonly compiler descriptor backed directly by one indexed slot.
 * Repeated expressions for the same instance slot share the descriptor.
 */
export function createIndexedReactiveValue<T>(target: object, index: number): ReactiveValue<T> {
	const indexed = indexedRecord(target, index, 'read source');
	const values = (indexed.values ??= []);
	const existing = values[index];
	if (existing) return existing as ReactiveValue<T>;
	const source = indexedParentSource(indexed, index, target) as ReactiveRef<T>;
	const value = {
		[reactiveValueMarker]: true,
		target: source.target,
		key: source.key,
		get: source.get,
		set: rejectReadonlyReactiveValueWrite
	} as ReactiveRef<T> & { [reactiveValueMarker]: true; [reactiveValueRef]?: ReactiveRef<T> };
	value[reactiveValueRef] = value;
	const reactiveValue = value as unknown as ReactiveValue<T>;
	values[index] = reactiveValue;
	return reactiveValue;
}

/** Reads one compiler-proven slot without collecting a dependency. */
export function peekIndexedReactiveSlot(value: object, index: number): unknown {
	const indexed = indexedRecord(value, index, 'peek');
	return peek(() =>
		readIndexedValue(indexed, indexedRecordKey(indexed, index), index, 'peek', value)
	);
}

/** Commits one compiler-proven slot without entering the facade's proxy traps. Internal commits may reuse the destination descriptor captured for the same write. */
export function setIndexedReactiveSlot(
	value: object,
	index: number,
	next: unknown,
	descriptor: PropertyDescriptor | undefined = undefined
): void {
	if (!writeIndexedRecord(indexedRecord(value, index, 'write'), index, next, value, descriptor))
		throw new TypeError('Cannot assign indexed state property');
}

/** Commits one compiler-proven slot and reports whether its dependency version advanced. */
export function setIndexedReactiveSlotWithResult(
	value: object,
	index: number,
	next: unknown
): boolean {
	const indexed = indexedRecord(value, index, 'write');
	const previous = readMutationVersion(indexed.target, index);
	if (!writeIndexedRecord(indexed, index, next, value))
		throw new TypeError('Cannot assign indexed state property');
	return readMutationVersion(indexed.target, index) !== previous;
}

/** Deletes one compiler-proven slot without entering the facade's proxy traps. */
export function deleteIndexedReactiveSlot(value: object, index: number): boolean {
	return deleteIndexedRecord(indexedRecord(value, index, 'delete'), index);
}

/** Deletes one compiler-proven slot and reports whether its dependency version advanced. */
export function deleteIndexedReactiveSlotWithResult(value: object, index: number): boolean {
	const indexed = indexedRecord(value, index, 'delete');
	const previous = readMutationVersion(indexed.target, index);
	if (!deleteIndexedRecord(indexed, index))
		throw new TypeError('Cannot delete indexed state property');
	return readMutationVersion(indexed.target, index) !== previous;
}

/** Commits a native assignment before publishing slot membership, dependencies, or undo ownership. */
function writeIndexedRecord(
	indexed: IndexedRecord,
	index: number,
	next: unknown,
	receiver: object,
	knownDescriptor?: PropertyDescriptor
): boolean {
	const key = indexedRecordKey(indexed, index);
	const descriptor = knownDescriptor ?? Reflect.getOwnPropertyDescriptor(indexed.target, key);
	if (descriptor && !('value' in descriptor)) {
		const accepted = Reflect.set(indexed.target, key, next, receiver);
		if (accepted) publishIndexedMutation(indexed, index, key);
		return accepted;
	}
	if (descriptor?.writable === false) return false;
	const previous = descriptor?.value;
	const raw = retainedIndexedValue(indexed, key, next);
	const value =
		!indexed.options.passthroughKeys?.includes(key) &&
		!isCompiledPropOperand(raw) &&
		!isReactiveValue(raw) &&
		raw &&
		typeof raw === 'object' &&
		isReactiveContainer(raw)
			? indexed.wrap(raw as object, indexed.options, indexedParentSource(indexed, index, receiver))
			: raw;
	if (
		descriptor &&
		!indexedSourceChanged(previous, value) &&
		!(indexed.preserveReactiveValues && reactiveSourceChanged(previous, value)) &&
		(Object.is(unwrap(previous), unwrap(value)) ||
			(isCompiledPropOperand(previous) && isCompiledPropOperand(value)))
	)
		return true;
	const undo = hasActiveTransaction() ? createPropertyUndo(indexed.target, key) : undefined;
	const accepted = descriptor
		? Reflect.set(indexed.target, key, value)
		: Reflect.defineProperty(indexed.target, key, {
				value,
				configurable: true,
				enumerable: true,
				writable: true
			});
	if (!accepted) return false;
	if (undo) recordTransactionUndo(undo, indexed.target, index);
	publishIndexedMutation(indexed, index, key, 'set', !descriptor);
	return true;
}

/** Publishes accepted property changes through numeric slots and any earlier unresolved key reads. */
function publishIndexedMutation(
	indexed: IndexedRecord,
	index: number,
	key: PropertyKey,
	operation: 'set' | 'define' | 'delete' = 'set',
	structural = false
): void {
	markReactiveHashDirty(indexed.target);
	trigger(indexed.target, index);
	if (index >= indexed.layout.keys.length) trigger(indexed.target, key);
	if (structural) trigger(indexed.target, iterateKey);
	notifyMutation(indexed.options, key, operation);
}

function seedIndexedRecord(indexed: IndexedRecord, initial: object, receiver: object): void {
	for (const key of Reflect.ownKeys(initial)) {
		const index = ensureIndexedRecordIndex(indexed, key);
		const raw = retainedIndexedValue(indexed, key, Reflect.get(initial, key));
		indexed.target[key] =
			!indexed.options.passthroughKeys?.includes(key) &&
			!isCompiledPropOperand(raw) &&
			!isReactiveValue(raw) &&
			raw &&
			typeof raw === 'object' &&
			isReactiveContainer(raw)
				? indexed.wrap(
						raw as object,
						indexed.options,
						indexedParentSource(indexed, index, receiver)
					)
				: raw;
	}
}

function retainedIndexedValue(indexed: IndexedRecord, key: PropertyKey, value: unknown): unknown {
	if (indexed.options.passthroughKeys?.includes(key)) return value;
	if (indexed.preserveReactiveValues && isReactiveValue(value)) return value;
	return unwrap(value);
}

function readIndexedValue(
	indexed: IndexedRecord,
	key: PropertyKey,
	index: number,
	mode: 'facade' | 'direct' | 'peek',
	receiver: object
): unknown {
	const current = Reflect.get(indexed.target, key, receiver);
	if (indexed.preserveReactiveValues && isCompiledPropOperand(current)) {
		if (mode !== 'peek') track(indexed.target, index);
		return readCompiledPropOperand(current);
	}
	if (indexed.options.passthroughKeys?.includes(key)) {
		if (mode !== 'peek') track(indexed.target, index);
		return current;
	}
	const value =
		indexed.preserveReactiveValues && isReactiveValue(current) ? current.get() : current;
	const raw = unwrap(value);
	if (raw && typeof raw === 'object' && isReactiveContainer(raw)) {
		if (requiresExactProxyValue(indexed.target, key)) {
			if (mode !== 'peek') track(indexed.target, index);
			return current;
		}
		if (mode === 'direct') track(indexed.target, index);
		return indexed.wrap(
			raw as object,
			indexed.options,
			indexedParentSource(indexed, index, receiver)
		);
	}
	if (mode !== 'peek') track(indexed.target, index);
	return raw;
}

/** Stable parent dependency used by nested proxies without subscribing a reader that only forwards them. */
function indexedParentSource(indexed: IndexedRecord, index: number, receiver: object): ReactiveRef {
	const sources = (indexed.sources ??= []);
	const existing = sources[index];
	if (existing) return existing;
	const source: ReactiveRef = {
		target: indexed.target,
		key: index,
		get() {
			return readIndexedValue(indexed, indexedRecordKey(indexed, index), index, 'direct', receiver);
		},
		set(value: unknown) {
			if (!writeIndexedRecord(indexed, index, value, receiver))
				throw new TypeError('Cannot assign indexed state property');
		}
	};
	sources[index] = source;
	return source;
}

/** Retires slot ownership only after native deletion succeeds. Failed deletes leave readers and journals intact. */
function deleteIndexedRecord(indexed: IndexedRecord, index: number): boolean {
	const key = indexedRecordKey(indexed, index);
	const descriptor = Reflect.getOwnPropertyDescriptor(indexed.target, key);
	const undo =
		descriptor && hasActiveTransaction() ? createPropertyUndo(indexed.target, key) : undefined;
	if (!Reflect.deleteProperty(indexed.target, key)) return false;
	if (descriptor) {
		if (undo) recordTransactionUndo(undo, indexed.target, index);
		publishIndexedMutation(indexed, index, key, 'delete', true);
	}
	return true;
}

export {
	reactiveOwnDependencies,
	reactiveIndexedDependencies,
	readIndexedReactiveSource,
	type ReactiveOwnDependencies
} from './reactive-record-slots.js';
