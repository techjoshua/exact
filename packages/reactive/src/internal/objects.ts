/** Returns whether a value is a plain object that can be structurally traversed. */
export function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
	if (!value || typeof value !== 'object') return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/** Returns whether an array key can affect iteration or length-sensitive dependencies. */
export function isArrayStructureKey(target: object, key: PropertyKey): boolean {
	return Array.isArray(target) && (key === 'length' || isArrayIndex(key));
}

function isArrayIndex(key: PropertyKey): boolean {
	if (typeof key === 'number') return Number.isInteger(key) && key >= 0;
	if (typeof key !== 'string' || key === '') return false;
	const index = Number(key);
	return Number.isInteger(index) && index >= 0 && String(index) === key;
}
