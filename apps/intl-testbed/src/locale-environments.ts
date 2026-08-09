import { createIntlEnvironment } from '@exactjs/intl';

/** Locales rendered simultaneously by the comparison grid. */
export const comparisonLocales = ['en-US', 'fr-FR', 'ja-JP', 'ar-EG'] as const;

/** One locale rendered by the comparison grid. */
export type ComparisonLocale = (typeof comparisonLocales)[number];

/** Long-lived environments used to expose locale differences without a mode switch. */
export const localeEnvironments = Object.freeze(
	Object.fromEntries(
		comparisonLocales.map((locale) => [locale, createIntlEnvironment({ locale })])
	) as Record<ComparisonLocale, ReturnType<typeof createIntlEnvironment>>
);

/** Applies the same application unit policy to every side-by-side environment. */
export function setComparisonUnitPolicy(policy: 'locale' | 'metric' | 'us'): void {
	for (const environment of Object.values(localeEnvironments)) {
		environment.setUnitPreferences(
			policy === 'metric'
				? {
						'length/road': 'kilometer',
						'length/person-height': 'centimeter',
						'temperature/weather': 'celsius',
						'area/land': 'hectare',
						'mass/person': 'kilogram',
						'volume/liquid': 'liter',
						'speed/road': 'kilometer-per-hour',
						'pressure/weather': 'hectopascal',
						'energy/food': 'kilojoule',
						'power/engine': 'kilowatt',
						'fuel-economy/road': 'liter-per-100-kilometer',
						'digital/storage': 'gigabyte'
					}
				: policy === 'us'
					? {
							'length/road': 'mile',
							'length/person-height': ['foot', 'inch'],
							'temperature/weather': 'fahrenheit',
							'area/land': 'acre',
							'mass/person': 'pound',
							'volume/liquid': 'gallon',
							'speed/road': 'mile-per-hour',
							'pressure/weather': 'inch-of-mercury',
							'energy/food': 'kilocalorie',
							'power/engine': 'horsepower',
							'fuel-economy/road': 'mile-per-gallon',
							'digital/storage': 'gigabyte'
						}
					: {}
		);
	}
}
