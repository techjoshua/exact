/**
 * Lists the fields JSON publication will read without admitting authored serialization hooks.
 * Arrays retain ordinary native methods and include hidden indices and holes. The cell bound
 * rejects large sparse arrays before allocating index keys. Named enumerable fields remain in
 * the list so existing graph validation still checks them even when JSON ignores them. The caller
 * still validates object prototypes and listed values. An unsupported array or JSON hook returns
 * undefined. maxArrayCells bounds the complete array length, including holes.
 */
export function jsonDataKeys(value: object, maxArrayCells: number): string[] | undefined {
	const array = Array.isArray(value);
	if (array) {
		if (
			Object.getPrototypeOf(value) !== Array.prototype ||
			value.length > maxArrayCells ||
			Object.hasOwn(value, Symbol.iterator) ||
			Object.hasOwn(value, 'map') ||
			Object.hasOwn(value, 'constructor')
		)
			return undefined;
	}
	if (hasJsonSerializationHook(value)) return undefined;
	const keys = Object.keys(value);
	if (!array) return keys;
	// Own enumerable indices sort before named fields. Equal length and the final index
	// therefore prove that every index is already present, avoiding another dense-array walk.
	if (
		keys.length === value.length &&
		(value.length === 0 || keys[keys.length - 1] === String(value.length - 1))
	)
		return keys;
	for (let index = 0; index < value.length; index++) {
		if (!Object.prototype.propertyIsEnumerable.call(value, index)) keys.push(String(index));
	}
	return keys;
}

/**
 * Reads a listed data property without invoking its getter. Unfilled array holes represent JSON
 * null cells, while inherited indices are rejected rather than read through a prototype.
 */
export function jsonDataProperty(value: object, key: string): PropertyDescriptor | undefined {
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	if (descriptor) return 'value' in descriptor ? descriptor : undefined;
	if (Array.isArray(value) && !(key in value)) {
		const index = Number(key);
		if (Number.isInteger(index) && index >= 0 && index < value.length && String(index) === key)
			return { value: null };
	}
	return undefined;
}

/** JSON consults toJSON even when it is hidden or inherited, so enumerable keys are insufficient. */
function hasJsonSerializationHook(value: object): boolean {
	if (!('toJSON' in value)) return false;
	let owner: object | null = value;
	while (owner) {
		const descriptor = Object.getOwnPropertyDescriptor(owner, 'toJSON');
		if (descriptor) return !('value' in descriptor) || typeof descriptor.value === 'function';
		owner = Object.getPrototypeOf(owner);
	}
	return false;
}

/** Rejects collection prototypes and own iteration or JSON hooks before a protocol encoder visits them. */
export function isNativeJsonCollection(value: Map<unknown, unknown> | Set<unknown>): boolean {
	return (
		Object.getPrototypeOf(value) === (value instanceof Map ? Map.prototype : Set.prototype) &&
		!Object.hasOwn(value, Symbol.iterator) &&
		!Object.hasOwn(value, 'toJSON')
	);
}
