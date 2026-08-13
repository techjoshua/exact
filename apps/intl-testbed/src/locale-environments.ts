import { intl } from '@exactjs/core';
import { createIntlEnvironment, defineIntlLocale, type IntlLocaleString } from '@exactjs/intl';

/** Locales rendered simultaneously by the comparison grid. */
export const comparisonLocales = ['en-US', 'fr-FR', 'ja-JP', 'ar-EG'] as const;

/** One locale rendered by the comparison grid. */
export type ComparisonLocale = (typeof comparisonLocales)[number];

/** Long-lived environments used to expose locale differences without a mode switch. */
export const localeEnvironments = Object.freeze(
	Object.fromEntries(
		comparisonLocales.map((locale) => [
			locale,
			createIntlEnvironment({ locale, sourceLocale: 'en-US' })
		])
	) as Record<ComparisonLocale, ReturnType<typeof createIntlEnvironment>>
);

/** Applies the same application unit policy to every side-by-side environment. */
export function setComparisonUnitPolicy(policy: 'locale' | 'metric' | 'us'): void {
	for (const locale of comparisonLocales)
		localeEnvironments[locale].setLocale(measurementLocale(locale, policy));
}

function measurementLocale(
	locale: ComparisonLocale,
	policy: 'locale' | 'metric' | 'us'
): IntlLocaleString {
	const baseName = intl.Locale(locale).baseName;
	return defineIntlLocale(
		policy === 'locale'
			? baseName
			: intl.getCanonicalLocales(
					`${baseName}-u-ms-${policy === 'metric' ? 'metric' : 'ussystem'}`
				)[0]!
	);
}
