import {
	validateIntlPackageMetadata,
	type IntlCatalogV1,
	type IntlPackageMetadataV1,
	type IntlPublishedMessagesV1,
	type IntlRuntimeDescriptorV1
} from '@exactjs/intl';
import { intl } from '@exactjs/core';
import { validateIntlCatalog, validateIntlRuntimeDescriptor } from '@exactjs/intl/internal';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Data-only intl publication loaded from one resolved package without evaluating package code. */
export interface IntlPackagePublication {
	readonly packageName: string;
	readonly packageRoot: string;
	readonly metadata: IntlPackageMetadataV1;
	readonly descriptors: readonly IntlRuntimeDescriptorV1[];
	readonly catalogs: readonly IntlCatalogV1[];
	readonly files: readonly string[];
}

/** Loads and validates selected locale data through bounded public package exports. */
export async function loadIntlPackagePublication(options: {
	packageJsonPath: string;
	locales: readonly string[];
}): Promise<IntlPackagePublication | undefined> {
	const packageJsonPath = path.resolve(options.packageJsonPath);
	const packageRoot = path.dirname(packageJsonPath);
	const manifest = jsonRecord(await readJson(packageJsonPath), 'package.json');
	const packageName = boundedString(manifest.name, 'package.json.name');
	const declaration = optionalRecord(optionalRecord(manifest.exact)?.internationalization);
	if (!declaration) return undefined;
	const metadata = validateIntlPackageMetadata(declaration);
	const exports = jsonRecord(manifest.exports, 'package.json.exports');
	const messagesFile = resolvePublishedDataFile(packageRoot, exports, metadata.messages);
	const published = validatePublishedMessages(await readJson(messagesFile), packageName, metadata);
	const catalogs: IntlCatalogV1[] = [];
	const files = [packageJsonPath, messagesFile];
	const requested = new Set(options.locales.flatMap(localeFallbackChain));
	for (const [locale, subpath] of Object.entries(metadata.catalogs ?? {})) {
		if (!requested.has(locale)) continue;
		const filename = resolvePublishedDataFile(packageRoot, exports, subpath);
		const catalog = validateIntlCatalog(await readJson(filename), published.descriptors);
		if (catalog.owner !== packageName)
			throw new TypeError(`Published catalog ${locale} must be owned by ${packageName}`);
		catalogs.push(catalog);
		files.push(filename);
	}
	return Object.freeze({
		packageName,
		packageRoot,
		metadata,
		descriptors: published.descriptors,
		catalogs: Object.freeze(catalogs),
		files: Object.freeze(files)
	});
}

function validatePublishedMessages(
	input: unknown,
	packageName: string,
	metadata: IntlPackageMetadataV1
): IntlPublishedMessagesV1 {
	const record = jsonRecord(input, 'published messages');
	requireKeys(record, ['protocol', 'owner', 'sourceLocale', 'descriptors']);
	if (record.protocol !== 1) throw new TypeError('Published messages protocol must be 1');
	if (record.owner !== packageName)
		throw new TypeError(`Published messages must be owned by ${packageName}`);
	const [sourceLocale] = intl.getCanonicalLocales(
		boundedString(record.sourceLocale, 'sourceLocale')
	);
	if (sourceLocale !== metadata.sourceLocale)
		throw new TypeError('Published messages sourceLocale must match package metadata');
	if (!Array.isArray(record.descriptors))
		throw new TypeError('Published descriptors must be an array');
	const descriptors = Object.freeze(
		record.descriptors.map((inputDescriptor) => {
			const descriptor = validateIntlRuntimeDescriptor(inputDescriptor);
			if (descriptor.owner !== packageName || descriptor.sourceLocale !== sourceLocale)
				throw new TypeError(
					'Published descriptor owner and sourceLocale must match package metadata'
				);
			return descriptor;
		})
	);
	return Object.freeze({ protocol: 1, owner: packageName, sourceLocale, descriptors });
}

function resolvePublishedDataFile(
	packageRoot: string,
	exports: Record<string, unknown>,
	subpath: string
): string {
	if (!(subpath in exports)) throw new TypeError(`Package does not publicly export ${subpath}`);
	const target = exportTarget(exports[subpath]);
	if (!target?.startsWith('./'))
		throw new TypeError(`Package export ${subpath} is not a local data file`);
	const resolved = path.resolve(packageRoot, target);
	const relative = path.relative(packageRoot, resolved);
	if (relative.startsWith('..') || path.isAbsolute(relative))
		throw new TypeError(`Package export ${subpath} escapes the package root`);
	return resolved;
}

function exportTarget(input: unknown): string | undefined {
	if (typeof input === 'string') return input;
	const record = optionalRecord(input);
	return record ? exportTarget(record.exact ?? record.import ?? record.default) : undefined;
}

function localeFallbackChain(locale: string): string[] {
	const canonical = intl.getCanonicalLocales(locale)[0];
	if (!canonical) return [];
	const language = intl.Locale(canonical).language;
	return canonical === language ? [canonical] : [canonical, language];
}

async function readJson(filename: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(filename, 'utf8')) as unknown;
	} catch (error) {
		throw new Error(
			`Unable to load published intl data ${filename}: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

function jsonRecord(input: unknown, name: string): Record<string, unknown> {
	const record = optionalRecord(input);
	if (!record) throw new TypeError(`${name} must be an object`);
	return record;
}

function optionalRecord(input: unknown): Record<string, unknown> | undefined {
	return typeof input === 'object' && input !== null && !Array.isArray(input)
		? (input as Record<string, unknown>)
		: undefined;
}

function boundedString(input: unknown, name: string): string {
	if (typeof input !== 'string' || input.length === 0 || input.length > 1024)
		throw new TypeError(`${name} must be a bounded string`);
	return input;
}

function requireKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
	for (const key of Object.keys(record))
		if (!allowed.includes(key))
			throw new TypeError(`Published messages contain unknown field ${key}`);
	for (const key of allowed)
		if (!(key in record)) throw new TypeError(`Published messages require ${key}`);
}
