import { intl } from '@exactjs/core';
import type { IntlBindingDescriptorV1 } from './contracts.js';
import type { IntlValidationLimits } from './descriptor-validation.js';

const bindingTypes = new Set([
	'string',
	'number',
	'bigint',
	'boolean',
	'temporal-date',
	'temporal-time',
	'temporal-date-time',
	'temporal-instant',
	'temporal-zoned-date-time',
	'temporal-duration',
	'monetary',
	'measurement',
	'structure',
	'opaque-structure'
]);

/** Requires a protocol binding type without coercing executable caller values to strings. */
export function requireBindingType(input: unknown, path: string): IntlBindingDescriptorV1['type'] {
	if (typeof input !== 'string' || !bindingTypes.has(input))
		throw new TypeError(`${path} has an unsupported binding type`);
	return input as IntlBindingDescriptorV1['type'];
}

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

/** Internal domain operation that require exact keys without publishing an application API. */
export function requireExactKeys(
	record: Record<string, unknown>,
	allowed: readonly string[],
	optional: readonly string[] = []
): void {
	for (const key of Object.keys(record))
		if (!allowed.includes(key)) throw new TypeError(`Unexpected intl protocol field "${key}"`);
	for (const key of allowed)
		if (!optional.includes(key) && !(key in record))
			throw new TypeError(`Missing intl protocol field "${key}"`);
}

/** Bounds both authored and NFC-normalized strings in UTF-16 code units before publication. */
export function requireBoundedString(input: unknown, path: string, maximum = 1024): string {
	if (typeof input !== 'string' || input.length === 0 || input.length > maximum)
		throw new TypeError(`${path} must be a nonempty string of at most ${maximum} code units`);
	const normalized = input.normalize('NFC');
	if (normalized.length > maximum)
		throw new TypeError(`${path} exceeds the normalized string limit of ${maximum} code units`);
	return normalized;
}

/** Captures configured work limits once and rejects nonfinite, fractional, or negative counts. */
export function captureValidationLimits(limits: IntlValidationLimits): IntlValidationLimits {
	const captured = {
		maxDepth: limits.maxDepth,
		maxNodes: limits.maxNodes,
		maxTextLength: limits.maxTextLength
	};
	for (const key of ['maxDepth', 'maxNodes', 'maxTextLength'] as const) {
		const value = captured[key];
		if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
			throw new RangeError(`Intl ${key} must be a non-negative safe integer`);
	}
	return captured;
}
