/** Captures plain-record fields once so validation and publication use the same values. */
export function requireRecord(input: unknown, path: string): Record<string, unknown> {
	if (typeof input !== 'object' || input === null || Array.isArray(input))
		throw new TypeError(`${path} must be an object`);
	const prototype = Object.getPrototypeOf(input);
	if (prototype !== Object.prototype && prototype !== null)
		throw new TypeError(`${path} must be a plain data object`);
	const record = Object.assign(Object.create(null) as Record<string, unknown>, input);
	// Ordinary protocol fields take the native copy path. Retain supported nonenumerable
	// fields without rereading the enumerable getters already captured by that copy.
	for (const key of Object.getOwnPropertyNames(input))
		if (!Object.hasOwn(record, key))
			Object.defineProperty(record, key, { value: Reflect.get(input, key) });
	return record;
}

/** Captures each dense array entry once without invoking caller-owned iteration methods. */
export function captureArray(input: unknown, path: string): unknown[] {
	if (!Array.isArray(input)) throw new TypeError(`${path} must be an array`);
	const length = input.length;
	const result: unknown[] = [];
	for (let index = 0; index < length; index++) {
		if (!Object.hasOwn(input, index)) throw new TypeError(`${path} must be a dense array`);
		result.push(input[index]);
	}
	return result;
}

/** Copies data-only protocol trees so public observations cannot mutate retained execution plans. */
export function copyIntlProtocolData<T>(value: T): T {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) {
		const result: unknown[] = [];
		for (let index = 0; index < value.length; index++)
			result.push(copyIntlProtocolData(value[index]));
		return result as T;
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [key, copyIntlProtocolData(entry)])
	) as T;
}
