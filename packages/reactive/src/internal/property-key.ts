/** Performs native ToPropertyKey once, preserving Symbol results and authored coercion effects. */
export function nativePropertyKey(value: unknown): PropertyKey {
	if (typeof value === 'symbol') return value;
	if (value === null || (typeof value !== 'object' && typeof value !== 'function'))
		return String(value);
	// Native computed names handle objects that return a Symbol from their coercion.
	return Reflect.ownKeys({ [value as unknown as PropertyKey]: undefined })[0]!;
}
/** Matches Map dependency-key identity, including NaN and signed zero. */
export function sameDependencyKey(left: PropertyKey, right: PropertyKey): boolean {
	return left === right || (left !== left && right !== right);
}
