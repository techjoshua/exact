import { record } from './protocol-value-shapes.js';
/** Checks bounded catalog metadata without allowing value-bearing records. */
export function boundedJson(value: unknown, depth: number): boolean {
	if (depth > 20) return false;
	if (
		value === null ||
		typeof value === 'boolean' ||
		(typeof value === 'number' && Number.isFinite(value)) ||
		(typeof value === 'string' && value.length <= 16_384)
	)
		return true;
	if (Array.isArray(value))
		return (
			value.length <= 10_000 && everyCatalogEntry(value, (item) => boundedJson(item, depth + 1))
		);
	if (!record(value) || hasValueField(value) || Object.keys(value).length > 1_000) return false;
	return Object.entries(value).every(
		([key, item]) => key.length <= 512 && boundedJson(item, depth + 1)
	);
}

/** Prevents authored values from entering inspection catalog metadata. */
export function hasValueField(value: Record<string, unknown>): boolean {
	return Object.prototype.hasOwnProperty.call(value, 'value');
}

/** Accepts native catalog arrays without authored iteration hooks or prototype behavior. */
export function catalogArray(value: unknown): value is readonly unknown[] {
	return (
		Array.isArray(value) &&
		Object.getPrototypeOf(value) === Array.prototype &&
		!Object.hasOwn(value, Symbol.iterator)
	);
}

/** Rejects missing and accessor array cells before validating each owned catalog entry. */
export function everyCatalogEntry(
	values: readonly unknown[],
	valid: (value: unknown) => boolean
): boolean {
	if (!catalogArray(values)) return false;
	for (let index = 0; index < values.length; index++) {
		const descriptor = Object.getOwnPropertyDescriptor(values, index);
		if (!descriptor || !('value' in descriptor) || !valid(descriptor.value)) return false;
	}
	return true;
}
