import { describe, expect, it } from 'vitest';
import { createIntlEnvironment, defineIntlLocale, intlLocaleMetadata } from './environment.js';

describe('locale environments', () => {
	it('validates dynamic locale strings and derives document metadata', () => {
		expect(defineIntlLocale('EN-us-u-ms-metric')).toBe('en-US-u-ms-metric');
		expect(() => defineIntlLocale('not a locale')).toThrow('valid BCP 47 locale');
		expect(intlLocaleMetadata('ar-EG-u-ms-metric')).toEqual({ lang: 'ar-EG', dir: 'rtl' });
		expect(intlLocaleMetadata('en-US')).toEqual({ lang: 'en-US', dir: 'ltr' });
	});

	it('reuses locale scopes and propagates provider policy updates', () => {
		const environment = createIntlEnvironment({ locale: 'en-US', catalogs: [], descriptors: [] });
		const french = environment.forLocale('fr-FR');

		expect(environment.forLocale('en-US')).toBe(environment);
		expect(environment.forLocale('fr-FR')).toBe(french);
		expect(french.sourceLocale).toBe('en-US');
		environment.setUnitPreferences({ 'length/road': 'kilometer' });
		expect(french.unitPreferences['length/road']).toBe('kilometer');
	});
});
