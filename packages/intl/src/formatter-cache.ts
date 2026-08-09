import type { IntlEnvironment } from './environment.js';

const maximumCachedFormatters = 128;
const environmentFormatters = new WeakMap<IntlEnvironment, Map<string, object>>();

/** Returns a shared native number formatter for one locale and finite option set. */
export function numberFormatter(
	environment: IntlEnvironment,
	options: Intl.NumberFormatOptions
): Intl.NumberFormat {
	const locale = environment.state.locale;
	return cachedFormatter(
		environment,
		'number',
		locale,
		options,
		() => new Intl.NumberFormat(locale, options)
	);
}

/** Returns a shared native date/time formatter for one locale and finite option set. */
export function dateTimeFormatter(
	environment: IntlEnvironment,
	options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
	const locale = environment.state.locale;
	return cachedFormatter(
		environment,
		'date-time',
		locale,
		options,
		() => new Intl.DateTimeFormat(locale, options)
	);
}

/** Returns a shared native plural-rules formatter for one locale and selection kind. */
export function pluralRulesFormatter(
	environment: IntlEnvironment,
	type: Intl.PluralRuleType
): Intl.PluralRules {
	const locale = environment.state.locale;
	return cachedFormatter(
		environment,
		'plural-rules',
		locale,
		{ type },
		() => new Intl.PluralRules(locale, { type })
	);
}

/** Returns a shared native relative-time formatter for one locale and finite option set. */
export function relativeTimeFormatter(
	environment: IntlEnvironment,
	options: Intl.RelativeTimeFormatOptions
): Intl.RelativeTimeFormat {
	const locale = environment.state.locale;
	return cachedFormatter(
		environment,
		'relative-time',
		locale,
		options,
		() => new Intl.RelativeTimeFormat(locale, options)
	);
}

/** Returns a shared native display-names formatter for one locale and finite option set. */
export function displayNamesFormatter(
	environment: IntlEnvironment,
	options: Intl.DisplayNamesOptions
): Intl.DisplayNames {
	const locale = environment.state.locale;
	return cachedFormatter(
		environment,
		'display-names',
		locale,
		options,
		() => new Intl.DisplayNames(locale, options)
	);
}

/** Returns a shared native list formatter for one locale and finite option set. */
export function listFormatter(
	environment: IntlEnvironment,
	options: Intl.ListFormatOptions
): Intl.ListFormat {
	const locale = environment.state.locale;
	return cachedFormatter(
		environment,
		'list',
		locale,
		options,
		() => new Intl.ListFormat(locale, options)
	);
}

/**
 * Returns a shared native or installed duration formatter. An unavailable constructor remains
 * uncached so a subsequently loaded capability provider can become visible.
 */
export function durationFormatter(
	environment: IntlEnvironment,
	options: Readonly<Record<string, unknown>>
): { format(value: unknown): string } | undefined {
	const locale = environment.state.locale;
	const DurationFormat = (
		Intl as unknown as {
			DurationFormat?: new (locale: string, options: object) => { format(value: unknown): string };
		}
	).DurationFormat;
	if (!DurationFormat) return undefined;
	return cachedFormatter(
		environment,
		'duration',
		locale,
		options,
		() => new DurationFormat(locale, options)
	);
}

/**
 * Maintains a small least-recently-used cache. Descriptor options are validated finite, flat data,
 * so a sorted entry list is a stable cache identity without retaining descriptor objects.
 */
function cachedFormatter<T extends object>(
	environment: IntlEnvironment,
	kind: string,
	locale: string,
	options: object,
	create: () => T
): T {
	let formatters = environmentFormatters.get(environment);
	if (!formatters) {
		formatters = new Map();
		environmentFormatters.set(environment, formatters);
	}
	const key = `${kind}\0${locale}\0${JSON.stringify(
		Object.entries(options).sort(([left], [right]) => left.localeCompare(right))
	)}`;
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
