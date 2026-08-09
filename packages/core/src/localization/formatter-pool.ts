import type { IntlDurationFormatter } from './contracts.js';

const maximumCachedFormatters = 128;
const formatters = new Map<string, object>();

/** Formatter constructors supported by the shared realm cache. */
export type IntlFormatterKind =
	| 'number'
	| 'date-time'
	| 'plural-rules'
	| 'relative-time'
	| 'display-names'
	| 'list'
	| 'collator'
	| 'segmenter'
	| 'locale'
	| 'duration';

/** Returns a shared formatter when its locale and options have safe structural identities. */
export function cachedIntlFormatter<T extends object>(
	kind: IntlFormatterKind,
	locales: Intl.LocalesArgument | undefined,
	options: object | undefined,
	create: () => T
): T {
	const localeKey = finiteLocaleKey(locales);
	const optionsKey = finiteOptionsKey(options);
	if (localeKey === undefined || optionsKey === undefined) return create();
	const key = `${kind}\0${localeKey}\0${optionsKey}`;
	const cached = formatters.get(key) as T | undefined;
	if (cached) {
		formatters.delete(key);
		formatters.set(key, cached);
		return cached;
	}
	const created = create();
	formatters.set(key, created);
	if (formatters.size > maximumCachedFormatters)
		formatters.delete(formatters.keys().next().value as string);
	return created;
}

/** Returns a duration formatter without caching constructor absence before a polyfill loads. */
export function cachedDurationFormatter(
	locales: Intl.LocalesArgument | undefined,
	options: Readonly<Record<string, unknown>> | undefined
): IntlDurationFormatter | undefined {
	const DurationFormat = (
		globalThis.Intl as unknown as {
			DurationFormat?: new (
				locales?: Intl.LocalesArgument,
				options?: Readonly<Record<string, unknown>>
			) => IntlDurationFormatter;
		}
	).DurationFormat;
	if (!DurationFormat) return undefined;
	return cachedIntlFormatter(
		'duration',
		locales,
		options,
		() => new DurationFormat(locales, options)
	);
}

/** Clears realm cache state for isolated tests; not part of the public package surface. */
export function clearIntlFormatterCache(): void {
	formatters.clear();
}

function finiteLocaleKey(locales: Intl.LocalesArgument | undefined): string | undefined {
	if (locales === undefined) return 'default';
	if (typeof locales === 'string') return `string:${locales}`;
	if (!Array.isArray(locales) || !locales.every((locale) => typeof locale === 'string'))
		return undefined;
	return `list:${JSON.stringify(locales)}`;
}

function finiteOptionsKey(options: object | undefined): string | undefined {
	if (options === undefined) return '{}';
	const prototype = Object.getPrototypeOf(options);
	if (prototype !== Object.prototype && prototype !== null) return undefined;
	const descriptors = Object.getOwnPropertyDescriptors(options);
	const entries: [string, string | number | boolean | null][] = [];
	for (const key of Object.keys(descriptors).sort()) {
		const descriptor = descriptors[key]!;
		if (!('value' in descriptor)) return undefined;
		const value = descriptor.value;
		if (value === undefined) continue;
		if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
			entries.push([key, value as string | number | boolean | null]);
			continue;
		}
		return undefined;
	}
	return JSON.stringify(entries);
}
