import { verifyIntlPolicyOwnership } from '../../component-composition-corpus/test-support/intl-measurement-journey.mjs';
import { captureReactiveMutations, flushSync, watch } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import {
	createIntlEnvironment,
	defineIntlLocale,
	intlLocaleMetadata,
	type IntlUnitPreferences
} from './environment.js';

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

describe('locale environment ordinary TypeScript values', () => {
	it('allows replacing a public method and observes the replacement normally', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		let calls = 0;
		environment.setLocale = (locale) => {
			calls++;
			environment.state.locale = locale;
		};
		environment.setLocale('fr-FR');
		expect(calls).toBe(1);
		expect(environment.state.locale).toBe('fr-FR');
	});

	it('returns independent writable locale metadata with readonly declarations', () => {
		const first = intlLocaleMetadata('en-US');
		const alias: { lang: string; dir: 'ltr' | 'rtl' } = first;
		alias.lang = 'observed';
		alias.dir = 'rtl';
		expect(first).toEqual({ lang: 'observed', dir: 'rtl' });
		expect(intlLocaleMetadata('en-US')).toEqual({ lang: 'en-US', dir: 'ltr' });
		if (false) {
			// @ts-expect-error Locale metadata retains its TypeScript readonly field declarations.
			first.lang = 'fr';
		}
	});
});

describe('owned unit preference state', () => {
	it('isolates caller arrays and public preference observations', () => {
		const units: ['foot' | 'meter', 'inch'] = ['foot', 'inch'];
		const preferences = { 'length/person-height': units };
		const first = createIntlEnvironment({ locale: 'en-US', unitPreferences: preferences });
		const second = createIntlEnvironment({ locale: 'en-US', unitPreferences: preferences });
		units[0] = 'meter';
		expect(first.unitPreferences['length/person-height']).toEqual(['foot', 'inch']);
		expect(second.unitPreferences['length/person-height']).toEqual(['foot', 'inch']);
		const observation = first.unitPreferences;
		const observedUnits = observation['length/person-height'];
		if (!Array.isArray(observedUnits)) throw new Error('Expected mixed units');
		Reflect.set(observedUnits, '0', 'meter');
		const alias: { 'length/road'?: IntlUnitPreferences['length/road'] } = observation;
		alias['length/road'] = 'meter';
		expect(first.unitPreferences['length/person-height']).toEqual(['foot', 'inch']);
		expect(first.unitPreferences['length/road']).toBeUndefined();
		if (false) {
			// @ts-expect-error Preference observations retain readonly TypeScript fields.
			observation['length/road'] = 'meter';
		}
	});

	it('captures one preference input across existing locale scopes', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		const french = environment.forLocale('fr-FR');
		const german = environment.forLocale('de-DE');
		let reads = 0;
		environment.setUnitPreferences({
			get 'length/road'() {
				reads++;
				return reads === 1 ? 'meter' : 'foot';
			}
		});
		expect(reads).toBe(1);
		for (const scope of [environment, french, german])
			expect(scope.unitPreferences['length/road']).toBe('meter');
	});

	it('does not let older propagation overwrite a reentrant newer policy', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		const french = environment.forLocale('fr-FR');
		const german = environment.forLocale('de-DE');
		let changed = false;
		french.setUnitPreferences = () => {
			if (!changed) {
				changed = true;
				environment.setUnitPreferences({ 'length/road': 'mile' });
			}
		};
		environment.setUnitPreferences({ 'length/road': 'meter' });
		expect(environment.unitPreferences['length/road']).toBe('mile');
		expect(german.unitPreferences['length/road']).toBe('mile');
	});
});

it('restores owned preference policy and locale scopes during reactive rollback', () => {
	const environment = createIntlEnvironment({
		locale: 'en-US',
		unitPreferences: { 'length/road': 'meter' }
	});
	const french = environment.forLocale('fr-FR');
	const journal = captureReactiveMutations(() =>
		environment.setUnitPreferences({ 'length/road': 'mile' })
	);
	expect(environment.unitPreferences['length/road']).toBe('mile');
	expect(french.unitPreferences['length/road']).toBe('mile');
	journal.rollback();
	expect(environment.unitPreferences['length/road']).toBe('meter');
	expect(french.unitPreferences['length/road']).toBe('meter');
	expect(environment.state.generation).toBe(0);
	expect(french.state.generation).toBe(0);
});

it('publishes one coherent preference update across related locale scopes', () => {
	const environment = createIntlEnvironment({
		locale: 'en-US',
		unitPreferences: { 'length/road': 'meter' }
	});
	const french = environment.forLocale('fr-FR');
	const values: string[] = [];
	const stop = watch(() => {
		values.push(
			`${environment.unitPreferences['length/road']}/${french.unitPreferences['length/road']}`
		);
	});
	try {
		environment.setUnitPreferences({ 'length/road': 'mile' });
		flushSync();
		expect(values).toEqual(['meter/meter', 'mile/mile']);
	} finally {
		stop();
	}
});

it('rolls back the complete policy update when a locale scope rejects propagation', () => {
	const environment = createIntlEnvironment({
		locale: 'en-US',
		unitPreferences: { 'length/road': 'meter' }
	});
	const french = environment.forLocale('fr-FR');
	const failure = { reason: 'scope policy failed' };
	french.setUnitPreferences = () => {
		throw failure;
	};
	try {
		environment.setUnitPreferences({ 'length/road': 'mile' });
		throw new Error('Expected scope rejection');
	} catch (error) {
		expect(error).toBe(failure);
	}
	expect(environment.unitPreferences['length/road']).toBe('meter');
	expect(environment.state.generation).toBe(0);
	expect(french.unitPreferences['length/road']).toBe('meter');
});

it('matches the public cross-runtime policy ownership journey', () => {
	expect(
		verifyIntlPolicyOwnership({ createIntlEnvironment, captureReactiveMutations, watch, flushSync })
	).toBe(true);
});

it('reapplies an unchanged parent policy to a locale scope with a local override', () => {
	const environment = createIntlEnvironment({
		locale: 'en-US',
		unitPreferences: { 'length/road': 'meter' }
	});
	const french = environment.forLocale('fr-FR');
	french.setUnitPreferences({ 'length/road': 'mile' });
	environment.setUnitPreferences({ 'length/road': 'meter' });
	expect(french.unitPreferences['length/road']).toBe('meter');
});
