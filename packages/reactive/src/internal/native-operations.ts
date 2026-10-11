/** Native receiver brands used by reactive and pending execution policies. */
export type NativeReceiverKind = 'array' | 'map' | 'set' | 'date';

/** Identifies a selected native function independently of its authored property name. */
export interface NativeOperation {
	readonly kind: NativeReceiverKind;
	readonly key: PropertyKey;
}

type NativeMembers = {
	values: Record<PropertyKey, unknown>;
	getters: Record<PropertyKey, unknown>;
};

// Independent pure captures let array-only consumers omit the other native catalogs.
const arrayMembers = /*#__PURE__*/ captureNativeMembers(Array.prototype);
const mapMembers = /*#__PURE__*/ captureNativeMembers(Map.prototype);
const setMembers = /*#__PURE__*/ captureNativeMembers(Set.prototype);
const dateMembers = /*#__PURE__*/ captureNativeMembers(Date.prototype);
let functions: WeakMap<(...args: never[]) => unknown, NativeOperation | null> | undefined;

/** Captures original member identity without retaining descriptor flags or invoking getters. */
function captureNativeMembers(prototype: object): NativeMembers {
	const values: Record<PropertyKey, unknown> = Object.create(null);
	const getters: Record<PropertyKey, unknown> = Object.create(null);
	for (const key of Reflect.ownKeys(prototype)) {
		const descriptor = Reflect.getOwnPropertyDescriptor(prototype, key)!;
		if ('value' in descriptor) values[key] = descriptor.value;
		else if (descriptor.get) getters[key] = descriptor.get;
	}
	return { values, getters };
}

/** Selects the original catalog for a branded receiver. */
function nativeMembers(kind: NativeReceiverKind): NativeMembers {
	switch (kind) {
		case 'array':
			return arrayMembers;
		case 'map':
			return mapMembers;
		case 'set':
			return setMembers;
		case 'date':
			return dateMembers;
	}
}

/** Reads captured Array identity without retaining catalogs for unrelated receiver brands. */
export function nativeArrayMember(key: PropertyKey): unknown {
	return arrayMembers.values[key];
}

/** Reads the captured native member without executing prototype or subclass getters. */
export function nativeMember(kind: NativeReceiverKind, key: PropertyKey): unknown {
	return nativeMembers(kind)?.values[key];
}

/** Selects a callable native member for an execution policy without invoking it. */
export function nativeCallable(
	kind: NativeReceiverKind,
	key: PropertyKey
): ((...args: unknown[]) => unknown) | undefined {
	const member = nativeMember(kind, key);
	return typeof member === 'function' ? (member as (...args: unknown[]) => unknown) : undefined;
}

/** Checks native accessor identity without invoking the getter. */
export function isNativeAccessor(
	kind: NativeReceiverKind,
	key: PropertyKey,
	getter: unknown
): boolean {
	return typeof getter === 'function' && nativeMembers(kind)?.getters[key] === getter;
}

/** Classifies original storage. Proxy unwrapping and ownership belong to the caller. */
export function nativeReceiverKind(value: object): NativeReceiverKind | undefined {
	return Array.isArray(value)
		? 'array'
		: value instanceof Map
			? 'map'
			: value instanceof Set
				? 'set'
				: value instanceof Date
					? 'date'
					: undefined;
}

/**
 * Recognizes original function identity only for its corresponding receiver brand.
 * Caches classifications on demand, including authored functions, without allocating a startup index.
 */
export function selectNativeOperation(
	original: unknown,
	receiver: object
): NativeOperation | undefined {
	if (typeof original !== 'function') return undefined;
	const kind = nativeReceiverKind(receiver);
	if (!kind) return undefined;
	const callable = original as (...args: never[]) => unknown;
	const cached = functions?.get(callable);
	if (cached !== undefined) return cached?.kind === kind ? cached : undefined;
	let operation: NativeOperation | null = null;
	// Preserve the original last-alias identity, including symbol-named iterator aliases.
	for (const candidate of ['array', 'map', 'set', 'date'] as const) {
		const values = nativeMembers(candidate).values;
		let selected: PropertyKey | undefined;
		for (const key of Reflect.ownKeys(values))
			if (key !== 'constructor' && values[key] === original) selected = key;
		if (selected !== undefined) operation = { kind: candidate, key: selected };
	}
	(functions ??= new WeakMap()).set(callable, operation);
	return operation?.kind === kind ? operation : undefined;
}
