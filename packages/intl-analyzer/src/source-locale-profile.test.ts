import { describe, expect, it } from 'vitest';
import { sourceLocaleProfile } from './source-locale-profile.js';

describe('native Intl source-locale profile', () => {
	it('collects localized currency names, symbols, and unit morphology', () => {
		const english = sourceLocaleProfile('en-US');
		const french = sourceLocaleProfile('fr-FR');
		const hindi = sourceLocaleProfile('hi-IN');
		const arabic = sourceLocaleProfile('ar-EG');

		expect(french.currencyLabels.euros).toEqual({ currency: 'EUR', display: 'name' });
		expect(english.unitLabels.Mb).toBe('megabit');
		expect(english.unitLabels.MB).toBe('megabyte');
		expect(french.unitLabels.kilomètres).toBe('kilometer');
		expect(hindi.currencyLabels['भारतीय रुपए']).toEqual({
			currency: 'INR',
			display: 'name'
		});
		expect(arabic.currencyLabels['ج.م.']).toEqual({ currency: 'EGP', display: 'symbol' });
	});

	it('layers language shorthand over generic native Intl evidence without leaking it', () => {
		const americanEnglish = sourceLocaleProfile('en-US');
		const britishEnglish = sourceLocaleProfile('en-GB');
		const french = sourceLocaleProfile('fr-FR');

		expect(americanEnglish.ordinalMarkers).toContain('st');
		expect(britishEnglish.ordinalMarkers).toContain('st');
		expect(americanEnglish.defaultCurrencyLabels).toEqual(['$']);
		expect(french.ordinalMarkers).toContain('er');
		expect(french.defaultCurrencyLabels).toEqual([]);
	});

	it.each([
		['de-DE', '.'],
		['fr-FR', 'er'],
		['es-MX', 'º'],
		['pt-BR', 'ª'],
		['it-IT', '°'],
		['nl-NL', 'ste'],
		['pl-PL', '.'],
		['uk-UA', '-й'],
		['ru-RU', '-я'],
		['ar-EG', 'الأول'],
		['hi-IN', 'वाँ'],
		['ja-JP', '番目'],
		['zh-Hans-CN', '第'],
		['ko-KR', '번째'],
		['tr-TR', '-inci'],
		['id-ID', 'ke-']
	])('provides bounded %s authored-language ordinal evidence', (locale, marker) => {
		expect(sourceLocaleProfile(locale).ordinalMarkers).toContain(marker);
	});

	it.each([
		'en-US',
		'es-MX',
		'pt-BR',
		'de-DE',
		'fr-FR',
		'pl-PL',
		'ru-RU',
		'uk-UA',
		'ar-EG',
		'hi-IN',
		'bn-BD',
		'ja-JP',
		'zh-Hans-CN',
		'ko-KR',
		'tr-TR',
		'id-ID'
	])('keeps the %s profile within the native request bounds', (locale) => {
		const profile = sourceLocaleProfile(locale);
		expect(Object.keys(profile.unitLabels).length).toBeGreaterThan(0);
		expect(Object.keys(profile.currencyLabels).length).toBeGreaterThan(0);
		expect(Object.keys(profile.unitLabels).length).toBeLessThanOrEqual(512);
		expect(Object.keys(profile.currencyLabels).length).toBeLessThanOrEqual(1024);
		expect(profile.defaultCurrencyLabels.length).toBeLessThanOrEqual(32);
		expect(profile.ordinalMarkers.length).toBeLessThanOrEqual(64);
		expect(profile.ordinalWrappers.length).toBeLessThanOrEqual(32);
	});
});
