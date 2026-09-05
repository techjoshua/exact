import type { IntlEnvironment } from './environment.js';
import { dateTimeFormatter, numberFormatter } from './formatter-cache.js';

/** Formats one finite numeric value through intl's shared locale-aware formatter cache. */
export function formatIntlNumberValue(
	environment: IntlEnvironment,
	value: number,
	options: Intl.NumberFormatOptions = {}
): string {
	if (!Number.isFinite(value))
		throw new TypeError('Intl numeric presentation requires a finite value');
	return numberFormatter(environment, options).format(value);
}

/** Formats one valid date-like value through intl's shared locale-aware formatter cache. */
export function formatIntlDateTimeValue(
	environment: IntlEnvironment,
	value: Date | number,
	options: Intl.DateTimeFormatOptions = {}
): string {
	const timestamp = value instanceof Date ? value.getTime() : value;
	if (!Number.isFinite(timestamp))
		throw new TypeError('Intl date presentation requires a valid value');
	return dateTimeFormatter(environment, options).format(value);
}
