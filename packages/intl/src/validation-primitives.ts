import { intl } from '@exactjs/core';
import type { IntlBindingDescriptorV1 } from './contracts.js';

/** Internal domain operation that require binding without publishing an application API. */
export function requireBinding(
	input: unknown,
	bindings: readonly IntlBindingDescriptorV1[],
	path: string
): IntlBindingDescriptorV1 {
	if (!Number.isInteger(input) || (input as number) < 0 || (input as number) >= bindings.length)
		throw new TypeError(`${path} references an undeclared binding`);
	return bindings[input as number]!;
}

/** Internal domain operation that canonical locale without publishing an application API. */
export function canonicalLocale(input: unknown, path: string): string {
	const locale = requireBoundedString(input, path);
	try {
		const [canonical] = intl.getCanonicalLocales(locale);
		if (!canonical) throw new RangeError('missing locale');
		return canonical;
	} catch {
		throw new TypeError(`${path} is not a valid BCP 47 locale`);
	}
}

/** Internal domain operation that require record without publishing an application API. */
export function requireRecord(input: unknown, path: string): Record<string, unknown> {
	if (typeof input !== 'object' || input === null || Array.isArray(input))
		throw new TypeError(`${path} must be an object`);
	const prototype = Object.getPrototypeOf(input);
	if (prototype !== Object.prototype && prototype !== null)
		throw new TypeError(`${path} must be a plain data object`);
	return input as Record<string, unknown>;
}

/** Internal domain operation that require exact keys without publishing an application API. */
export function requireExactKeys(
	record: Record<string, unknown>,
	allowed: readonly string[],
	optional: readonly string[] = []
): void {
	const allowedSet = new Set(allowed);
	for (const key of Object.keys(record))
		if (!allowedSet.has(key)) throw new TypeError(`Unexpected intl protocol field "${key}"`);
	const optionalSet = new Set(optional);
	for (const key of allowed)
		if (!optionalSet.has(key) && !(key in record))
			throw new TypeError(`Missing intl protocol field "${key}"`);
}

/** Internal domain operation that require bounded string without publishing an application API. */
export function requireBoundedString(input: unknown, path: string, maximum = 1024): string {
	if (typeof input !== 'string' || input.length === 0 || input.length > maximum)
		throw new TypeError(`${path} must be a nonempty string of at most ${maximum} code units`);
	return input.normalize('NFC');
}
