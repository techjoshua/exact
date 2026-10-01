/** Native receiver brands used by reactive and pending execution policies. */
export type NativeReceiverKind = 'array' | 'map' | 'set' | 'date';

/** Identifies a selected native function independently of its authored property name. */
export interface NativeOperation {
	readonly kind: NativeReceiverKind;
	readonly key: PropertyKey;
}

const prototypes: Record<NativeReceiverKind, object> = {
	array: Array.prototype,
	map: Map.prototype,
	set: Set.prototype,
	date: Date.prototype
};
const members: Record<NativeReceiverKind, Record<PropertyKey, PropertyDescriptor>> = Object.create(
	null
);
const functions = new WeakMap<(...args: never[]) => unknown, NativeOperation>();
for (const kind of Object.keys(prototypes) as NativeReceiverKind[]) {
	const descriptors: Record<PropertyKey, PropertyDescriptor> = Object.create(null);
	for (const key of Reflect.ownKeys(prototypes[kind])) {
		const descriptor = Reflect.getOwnPropertyDescriptor(prototypes[kind], key)!;
		descriptors[key] = descriptor;
		if (key !== 'constructor' && typeof descriptor.value === 'function')
			functions.set(descriptor.value, { kind, key });
	}
	members[kind] = descriptors;
}

/** Reads the captured native member without executing prototype or subclass getters. */
export function nativeMember(kind: NativeReceiverKind, key: PropertyKey): unknown {
	return members[kind]?.[key]?.value;
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
	return typeof getter === 'function' && members[kind]?.[key]?.get === getter;
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

/** Recognizes function identity only when the selected receiver has the corresponding native brand. */
export function selectNativeOperation(
	original: unknown,
	receiver: object
): NativeOperation | undefined {
	if (typeof original !== 'function') return undefined;
	const operation = functions.get(original as (...args: never[]) => unknown);
	return operation && nativeReceiverKind(receiver) === operation.kind ? operation : undefined;
}
