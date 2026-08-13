import { describe, expect, it } from 'vitest';
import { intlCldrVersion, resolveCldrUnitPreference } from './unit-preferences.js';

describe('CLDR unit preferences', () => {
	it('uses CLDR 48 regional preferences beyond a US/GB/world split', () => {
		expect(
			resolveCldrUnitPreference('en-CA', 'length', 'person-height', [180], 'centimeter')
		).toEqual(['foot', 'inch']);
		expect(
			resolveCldrUnitPreference('fr-FR', 'length', 'person-height', [180], 'centimeter')
		).toEqual(['meter', 'centimeter']);
		expect(resolveCldrUnitPreference('en-BS', 'temperature', 'weather', [20], 'celsius')).toBe(
			'fahrenheit'
		);
		expect(resolveCldrUnitPreference('es-MX', 'pressure', 'weather', [1013], 'hectopascal')).toBe(
			'millimeter-of-mercury'
		);
		expect(resolveCldrUnitPreference('pt-BR', 'pressure', 'weather', [1013], 'hectopascal')).toBe(
			'millibar'
		);
		expect(resolveCldrUnitPreference('sv-SE', 'length', 'road', [20], 'kilometer')).toBe(
			'mile-scandinavian'
		);
		expect(intlCldrVersion).toBe('48');
	});

	it('selects threshold-sensitive road units from the evaluated magnitude', () => {
		expect(resolveCldrUnitPreference('de-DE', 'length', 'road', [1], 'mile')).toBe('kilometer');
		expect(resolveCldrUnitPreference('de-DE', 'length', 'road', [0.25], 'mile')).toBe('meter');
		expect(resolveCldrUnitPreference('en-GB', 'length', 'road', [0.05], 'mile')).toBe('yard');
	});

	it('honors Unicode measurement-system overrides before locale region', () => {
		expect(
			resolveCldrUnitPreference('en-DE-u-ms-ussystem', 'length', 'road', [10], 'kilometer')
		).toBe('mile');
		expect(resolveCldrUnitPreference('en-US-u-ms-metric', 'length', 'road', [10], 'mile')).toBe(
			'kilometer'
		);
		expect(
			resolveCldrUnitPreference('sv-SE-u-ms-metric', 'length', 'road', [20], 'kilometer')
		).toBe('mile-scandinavian');
		expect(resolveCldrUnitPreference('en-GB-u-ms-ussystem', 'volume', 'liquid', [1], 'liter')).toBe(
			'gallon'
		);
	});

	it('honors the Unicode region override before the likely locale region', () => {
		expect(
			resolveCldrUnitPreference('en-US-u-rg-gbzzzz', 'length', 'road', [10], 'kilometer')
		).toBe('mile');
	});

	it('leaves semantic families without CLDR preference data unchanged', () => {
		expect(
			resolveCldrUnitPreference('en-US', 'digital', 'storage', [1], 'gigabyte')
		).toBeUndefined();
	});
});
