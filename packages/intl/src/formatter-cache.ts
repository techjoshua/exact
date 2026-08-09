import { intl } from '@exactjs/core';
import type { IntlEnvironment } from './environment.js';

/** Returns a shared native number formatter for one locale and finite option set. */
export function numberFormatter(
	environment: IntlEnvironment,
	options: Intl.NumberFormatOptions
): Intl.NumberFormat {
	const locale = environment.state.locale;
	return intl.NumberFormat(locale, options);
}

/** Returns a shared native date/time formatter for one locale and finite option set. */
export function dateTimeFormatter(
	environment: IntlEnvironment,
	options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
	const locale = environment.state.locale;
	return intl.DateTimeFormat(locale, options);
}

/** Returns a shared native plural-rules formatter for one locale and selection kind. */
export function pluralRulesFormatter(
	environment: IntlEnvironment,
	type: Intl.PluralRuleType
): Intl.PluralRules {
	const locale = environment.state.locale;
	return intl.PluralRules(locale, { type });
}

/** Returns a shared native relative-time formatter for one locale and finite option set. */
export function relativeTimeFormatter(
	environment: IntlEnvironment,
	options: Intl.RelativeTimeFormatOptions
): Intl.RelativeTimeFormat {
	const locale = environment.state.locale;
	return intl.RelativeTimeFormat(locale, options);
}

/** Returns a shared native display-names formatter for one locale and finite option set. */
export function displayNamesFormatter(
	environment: IntlEnvironment,
	options: Intl.DisplayNamesOptions
): Intl.DisplayNames {
	const locale = environment.state.locale;
	return intl.DisplayNames(locale, options);
}

/** Returns a shared native list formatter for one locale and finite option set. */
export function listFormatter(
	environment: IntlEnvironment,
	options: Intl.ListFormatOptions
): Intl.ListFormat {
	const locale = environment.state.locale;
	return intl.ListFormat(locale, options);
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
	return intl.DurationFormat(locale, options);
}
