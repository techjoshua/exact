import type { IntlUnitPreferences } from './environment.js';
import { captureArray } from './protocol-data.js';

/** Captures one plain preference map and dense unit tuples without freezing caller data or sharing arrays. */
export function copyIntlUnitPreferences(preferences: IntlUnitPreferences): IntlUnitPreferences {
	const copy = { ...preferences };
	for (const [key, value] of Object.entries(copy))
		if (Array.isArray(value))
			Object.defineProperty(copy, key, {
				value: captureArray(value, `Intl unit preference ${key}`),
				enumerable: true,
				configurable: true,
				writable: true
			});
	return copy;
}
