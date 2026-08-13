import { intl } from '@exactjs/core';
import type { IntlPackageMetadataV1 } from './contracts.js';

const metadataFields = new Set(['protocol', 'sourceLocale', 'sourceUnits', 'messages', 'catalogs']);

/** Validates and freezes a package's inert protocol-1 internationalization declaration. */
export function validateIntlPackageMetadata(input: unknown): IntlPackageMetadataV1 {
	if (typeof input !== 'object' || input === null || Array.isArray(input))
		throw new TypeError('exact.internationalization must be an object');
	const record = input as Record<string, unknown>;
	for (const field of Object.keys(record))
		if (!metadataFields.has(field))
			throw new TypeError(`Unknown protocol-1 internationalization field "${field}"`);
	if (record.protocol !== 1)
		throw new TypeError('Internationalization metadata protocol must be 1');
	const sourceLocale = canonicalLocale(record.sourceLocale, 'sourceLocale');
	const messages = exportSubpath(record.messages, 'messages');
	const sourceUnits = optionalStringRecord(record.sourceUnits, 'sourceUnits', false, false);
	const catalogs = optionalStringRecord(record.catalogs, 'catalogs', true, true);
	return Object.freeze({
		protocol: 1,
		sourceLocale,
		...(sourceUnits ? { sourceUnits } : {}),
		messages,
		...(catalogs ? { catalogs } : {})
	});
}

function optionalStringRecord(
	input: unknown,
	path: string,
	localeKeys: boolean,
	exportValues: boolean
): Readonly<Record<string, string>> | undefined {
	if (input === undefined) return undefined;
	if (typeof input !== 'object' || input === null || Array.isArray(input))
		throw new TypeError(`${path} must be an object`);
	const output: Record<string, string> = Object.create(null) as Record<string, string>;
	for (const [rawKey, rawValue] of Object.entries(input)) {
		const key = localeKeys ? canonicalLocale(rawKey, `${path} key`) : semanticUnitKey(rawKey, path);
		output[key] = exportValues
			? exportSubpath(rawValue, `${path}.${rawKey}`)
			: boundedIdentifier(rawValue, `${path}.${rawKey}`);
	}
	return Object.freeze(output);
}

function boundedIdentifier(input: unknown, path: string): string {
	if (typeof input !== 'string' || !/^[A-Za-z][A-Za-z0-9-]{0,63}$/u.test(input))
		throw new TypeError(`${path} must be a bounded unit identifier`);
	return input;
}

function semanticUnitKey(input: string, path: string): string {
	if (!/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/u.test(input))
		throw new TypeError(`${path} key "${input}" must be a canonical quantity/usage pair`);
	return input;
}

function exportSubpath(input: unknown, path: string): string {
	if (
		typeof input !== 'string' ||
		!/^\.\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(input) ||
		input.includes('..') ||
		input.includes('\\')
	)
		throw new TypeError(`${path} must be a bounded public package export subpath`);
	return input;
}

function canonicalLocale(input: unknown, path: string): string {
	if (typeof input !== 'string') throw new TypeError(`${path} must be a BCP 47 locale`);
	const [locale] = intl.getCanonicalLocales(input);
	if (!locale) throw new TypeError(`${path} must be a BCP 47 locale`);
	return locale;
}
