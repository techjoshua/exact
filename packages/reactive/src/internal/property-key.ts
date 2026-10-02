/** Performs native ToPropertyKey once, preserving Symbol results and authored coercion effects. */
export function nativePropertyKey(value: unknown): PropertyKey {
	if (typeof value === 'symbol') return value;
	if (value === null || (typeof value !== 'object' && typeof value !== 'function'))
		return String(value);
	// Native computed names handle objects that return a Symbol from their coercion.
	return Reflect.ownKeys({ [value as unknown as PropertyKey]: undefined })[0]!;
}
