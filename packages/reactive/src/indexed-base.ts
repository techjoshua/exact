import {
	proxyMarker,
	rawTarget,
	reactiveValueMarker,
	reactiveValueRef
} from './internal/symbols.js';
import type { Reactive, ReactiveOptions, ReactiveRef, ReactiveValue } from './internal/types.js';
import {
	batch,
	hasActiveTransaction,
	readMutationVersion,
	recordTransactionUndo,
	track,
	trigger
} from './internal/deps.js';
import { hasChanged, isReactiveContainer } from './change-detection.js';
import { isReactiveValue, rejectReadonlyReactiveValueWrite, unwrap } from './internal/values.js';
import { indexedLayout } from './indexed-layout.js';
import {
	ensureIndexedRecordIndex,
	indexedRecordIndex,
	indexedRecordKey,
	type IndexedRecordLayout
} from './reactive-record-slots.js';

type IndexedRecord = IndexedRecordLayout & {
	readonly initialized: boolean[];
	readonly target: Record<PropertyKey, unknown>;
	readonly options: ReactiveOptions;
	readonly wrap: (value: object, options: ReactiveOptions, parentSource?: ReactiveRef) => object;
	readonly preserveReactiveValues: boolean;
	sources?: ReactiveRef[];
	values?: ReactiveValue[];
};

/** Stable dependency keys for compiler-known fields on one indexed reactive target. */
export type ReactiveOwnDependencies = Readonly<{
	target: object;
	keys: readonly PropertyKey[];
}>;

/** Private compiler operand for one direct property read owned by a component prop slot. */
export const compiledReactivePropertyOperand = Symbol.for('exact.reactive.property-operand');

/** Identifies a compiler-proven direct property read without allocating a reader function. */
export type CompiledReactivePropertyOperand = readonly [
	marker: typeof compiledReactivePropertyOperand,
	owner: object,
	key: PropertyKey
];

const indexedRecords = new WeakMap<object, IndexedRecord>();

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
		const { record } = this;
		const index = indexedRecordIndex(record, key);
		return index === undefined
			? Reflect.get(target, key, receiver)
			: readIndexedValue(record, key, index, 'facade');
	},
	set(this: IndexedProxyHandler, _target, key, next) {
		const { record } = this;
		if (record.options.readonly) {
			record.options.onReadonlyWrite?.(key);
			return false;
		}
		const index = ensureIndexedRecordIndex(record, key);
		return writeIndexedRecord(record, index, next);
	},
	deleteProperty(this: IndexedProxyHandler, target, key) {
		const { record } = this;
		const index = indexedRecordIndex(record, key);
		return index === undefined
			? Reflect.deleteProperty(target, key)
			: deleteIndexedRecord(record, index);
	},
	has(this: IndexedProxyHandler, target, key) {
		const { record } = this;
		const index = indexedRecordIndex(record, key);
		return (index !== undefined && record.initialized[index] === true) || Reflect.has(target, key);
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
	const initialized = new Array<boolean>(layout.keys.length).fill(false);
	const record: IndexedRecord = {
		layout,
		initialized,
		target,
		options,
		wrap,
		preserveReactiveValues
	};
	if (initial) seedIndexedRecord(record, initial);

	const handler = Object.create(indexedProxyHandler) as IndexedProxyHandler;
	handler.record = record;
	const facade = new Proxy(target, handler);
	indexedRecords.set(facade, record);
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
			if (index !== undefined) deleteIndexedRecord(indexed, index);
		}
		for (const key of Reflect.ownKeys(next)) {
			const incoming = Reflect.get(next, key);
			const index = ensureIndexedRecordIndex(indexed, key);
			if (indexed.initialized[index] && reconcileNested(indexed.target[key], incoming)) continue;
			writeIndexedRecord(indexed, index, incoming);
		}
	});
	return true;
}

/** Request-owned result cell for allocation-free repeated own-property reads. */
export type ReactiveOwnPropertyReadCell = { value: unknown };

/** Reads an own field into a caller-owned cell without invoking an arbitrary accessor. */
export function readReactiveOwnPropertyInto(
	value: object,
	key: PropertyKey,
	cell: ReactiveOwnPropertyReadCell
): boolean {
	const indexed = indexedRecords.get(value);
	if (indexed) {
		const index = indexedRecordIndex(indexed, key);
		if (index !== undefined && indexed.initialized[index]) {
			cell.value = indexed.target[key];
			return true;
		}
		cell.value = undefined;
		return false;
	}
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	if (descriptor && 'value' in descriptor) {
		cell.value = descriptor.value;
		return true;
	}
	cell.value = undefined;
	return false;
}

/** Reads an own field without invoking an arbitrary user-defined accessor. */
export function readReactiveOwnProperty(
	value: object,
	key: PropertyKey
): { present: true; value: unknown } | { present: false } {
	const cell: ReactiveOwnPropertyReadCell = { value: undefined };
	return readReactiveOwnPropertyInto(value, key, cell)
		? { present: true, value: cell.value }
		: { present: false };
}

/** Reads one compiler-proven top-level slot without entering the facade's property trap. */
export function readIndexedReactiveSlot(value: object, index: number): unknown {
	const indexed = indexedRecord(value, index, 'read');
	return readIndexedValue(indexed, indexedRecordKey(indexed, index), index, 'direct');
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
	const source = indexedParentSource(indexed, index) as ReactiveRef<T>;
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
	return readIndexedValue(indexed, indexedRecordKey(indexed, index), index, 'peek');
}

/** Commits one compiler-proven slot without entering the facade's proxy traps. */
export function setIndexedReactiveSlot(value: object, index: number, next: unknown): void {
	writeIndexedRecord(indexedRecord(value, index, 'write'), index, next);
}

/** Commits one compiler-proven slot and reports whether its dependency version advanced. */
export function setIndexedReactiveSlotWithResult(
	value: object,
	index: number,
	next: unknown
): boolean {
	const indexed = indexedRecord(value, index, 'write');
	const previous = readMutationVersion(indexed.target, index);
	writeIndexedRecord(indexed, index, next);
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
	deleteIndexedRecord(indexed, index);
	return readMutationVersion(indexed.target, index) !== previous;
}

function indexedRecord(value: object, index: number, operation: string): IndexedRecord {
	const indexed = indexedRecords.get(value);
	if (!indexed || !Number.isSafeInteger(index) || index < 0 || index >= indexed.initialized.length)
		throw new TypeError(`Compiled reactive ${operation} referenced an invalid indexed slot`);
	return indexed;
}

function writeIndexedRecord(indexed: IndexedRecord, index: number, next: unknown): boolean {
	const key = indexedRecordKey(indexed, index);
	const previous = indexed.target[key];
	const raw = retainedIndexedValue(indexed, key, next);
	const value =
		!indexed.options.passthroughKeys?.includes(key) &&
		!(Array.isArray(raw) && raw[0] === compiledReactivePropertyOperand) &&
		!isReactiveValue(raw) &&
		raw &&
		typeof raw === 'object' &&
		isReactiveContainer(raw)
			? indexed.wrap(raw as object, indexed.options, indexedParentSource(indexed, index))
			: raw;
	const wasInitialized = indexed.initialized[index] === true;
	if (wasInitialized && !hasChanged(previous, value)) return true;
	if (hasActiveTransaction())
		recordTransactionUndo(
			() => {
				if (wasInitialized) indexed.target[key] = previous;
				if (!wasInitialized) {
					indexed.initialized[index] = false;
					Reflect.deleteProperty(indexed.target, key);
				}
			},
			indexed.target,
			index
		);
	Reflect.defineProperty(indexed.target, key, {
		configurable: true,
		enumerable: true,
		value,
		writable: true
	});
	indexed.initialized[index] = true;
	trigger(indexed.target, index);
	try {
		indexed.options.onMutation?.(key, 'set');
	} catch {
		// Observability must not alter state semantics.
	}
	return true;
}

function seedIndexedRecord(indexed: IndexedRecord, initial: object): void {
	for (const key of Reflect.ownKeys(initial)) {
		const index = ensureIndexedRecordIndex(indexed, key);
		const raw = retainedIndexedValue(indexed, key, Reflect.get(initial, key));
		indexed.target[key] =
			!indexed.options.passthroughKeys?.includes(key) &&
			!(Array.isArray(raw) && raw[0] === compiledReactivePropertyOperand) &&
			!isReactiveValue(raw) &&
			raw &&
			typeof raw === 'object' &&
			isReactiveContainer(raw)
				? indexed.wrap(raw as object, indexed.options, indexedParentSource(indexed, index))
				: raw;
		indexed.initialized[index] = true;
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
	mode: 'facade' | 'direct' | 'peek'
): unknown {
	const current = indexed.target[key];
	if (indexed.options.passthroughKeys?.includes(key)) {
		if (mode !== 'peek') track(indexed.target, index);
		return current;
	}
	const propertyOperand =
		indexed.preserveReactiveValues &&
		Array.isArray(current) &&
		current[0] === compiledReactivePropertyOperand
			? (current as unknown as CompiledReactivePropertyOperand)
			: undefined;
	const value = propertyOperand
		? Reflect.get(propertyOperand[1], propertyOperand[2])
		: indexed.preserveReactiveValues && isReactiveValue(current)
			? current.get()
			: current;
	const raw = unwrap(value);
	if (raw && typeof raw === 'object' && isReactiveContainer(raw)) {
		if (mode === 'direct') track(indexed.target, index);
		return indexed.wrap(raw as object, indexed.options, indexedParentSource(indexed, index));
	}
	if (mode !== 'peek') track(indexed.target, index);
	return raw;
}

/** Stable parent dependency used by nested proxies without subscribing a reader that only forwards them. */
function indexedParentSource(indexed: IndexedRecord, index: number): ReactiveRef {
	const sources = (indexed.sources ??= []);
	const existing = sources[index];
	if (existing) return existing;
	const source: ReactiveRef = {
		target: indexed.target,
		key: index,
		get() {
			return readIndexedValue(indexed, indexedRecordKey(indexed, index), index, 'direct');
		},
		set(value: unknown) {
			writeIndexedRecord(indexed, index, value);
		}
	};
	sources[index] = source;
	return source;
}

function deleteIndexedRecord(indexed: IndexedRecord, index: number): boolean {
	const key = indexedRecordKey(indexed, index);
	if (indexed.initialized[index]) {
		const previous = indexed.target[key];
		if (hasActiveTransaction())
			recordTransactionUndo(
				() => {
					Reflect.defineProperty(indexed.target, key, {
						configurable: true,
						enumerable: true,
						value: previous,
						writable: true
					});
					indexed.initialized[index] = true;
				},
				indexed.target,
				index
			);
		trigger(indexed.target, index);
	}
	indexed.initialized[index] = false;
	return Reflect.deleteProperty(indexed.target, key);
}

/** Resolves compiler-known own fields to compact stable dependencies without evaluating them. */
export function reactiveOwnDependencies(
	value: object,
	keys: readonly PropertyKey[]
): ReactiveOwnDependencies | undefined {
	const indexed = indexedRecords.get(value);
	if (!indexed) return undefined;
	const indexes: PropertyKey[] = [];
	for (const key of keys) {
		const index = indexedRecordIndex(indexed, key);
		if (index === undefined) return undefined;
		indexes.push(index);
	}
	return {
		target: indexed.target,
		keys: indexes
	};
}

/** Resolves compiler-emitted numeric fields without repeating a property-layout lookup. */
export function reactiveIndexedDependencies(
	value: object,
	indexes: readonly number[]
): ReactiveOwnDependencies | undefined {
	const indexed = indexedRecords.get(value);
	if (!indexed) return undefined;
	for (const index of indexes) {
		if (!Number.isSafeInteger(index) || index < 0 || index >= indexed.initialized.length)
			return undefined;
	}
	return { target: indexed.target, keys: indexes };
}

/** Reads the retained source value for one validated compiler-indexed field without evaluating it. */
export function readIndexedReactiveSource(
	value: object,
	index: number
): { present: true; value: unknown } | { present: false } {
	const indexed = indexedRecords.get(value);
	if (
		!indexed ||
		!Number.isSafeInteger(index) ||
		index < 0 ||
		index >= indexed.initialized.length ||
		!indexed.initialized[index]
	)
		return { present: false };
	return { present: true, value: indexed.target[indexedRecordKey(indexed, index)] };
}
