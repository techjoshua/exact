import { describe, expect, it } from 'vitest';
import { createComponentInstance } from '../component/runtime.js';
import type { Component } from '../component/contracts.js';
import { LocalizationContext } from './context.js';
import { intl } from './facade.js';
import { clearIntlFormatterCache } from './formatter-pool.js';

describe('realm Intl formatter facade', () => {
	it('shares finite formatter configurations through the public helper facade', () => {
		clearIntlFormatterCache();
		expect(intl.NumberFormat('en-US', { style: 'decimal' })).toBe(
			intl.NumberFormat('en-US', { style: 'decimal' })
		);
		expect(intl.NumberFormat('fr-FR', { style: 'decimal' })).not.toBe(
			intl.NumberFormat('en-US', { style: 'decimal' })
		);
	});

	it('resolves omitted and authored source locales through the nearest component provider', () => {
		clearIntlFormatterCache();
		function Parent(this: Component<{}>) {
			this.setContext(LocalizationContext, { locale: 'fr-FR', sourceLocale: 'en-US' });
			return () => null;
		}
		const parent = createComponentInstance(Parent, {});
		const child = createComponentInstance(
			function Child(this: Component<{}>) {
				expect(this.intl.NumberFormat()).toBe(intl.NumberFormat('fr-FR'));
				expect(this.intl.NumberFormat('en-US')).toBe(intl.NumberFormat('fr-FR'));
				expect(this.intl.NumberFormat('de-DE')).toBe(intl.NumberFormat('de-DE'));
				return () => null;
			},
			{},
			parent
		);

		expect(child.intl.NumberFormat().format(1234)).toBe(intl.NumberFormat('fr-FR').format(1234));
	});

	it('does not cache options with observable accessors', () => {
		clearIntlFormatterCache();
		let reads = 0;
		const options = Object.defineProperty({}, 'style', {
			enumerable: true,
			get() {
				reads++;
				return 'decimal';
			}
		});
		expect(intl.NumberFormat('en-US', options)).not.toBe(intl.NumberFormat('en-US', options));
		expect(reads).toBe(2);
	});

	it('preserves native number and Date locale-string projections', () => {
		clearIntlFormatterCache();
		const date = new Date('2026-08-08T12:34:56Z');
		expect(intl.formatNumber(1234567.5, 'de-DE')).toBe((1234567.5).toLocaleString('de-DE'));
		expect(intl.formatDate(date, 'date-time', 'en-US', { timeZone: 'UTC' })).toBe(
			date.toLocaleString('en-US', { timeZone: 'UTC' })
		);
		expect(intl.formatDate(date, 'date', 'en-US', { timeZone: 'UTC' })).toBe(
			date.toLocaleDateString('en-US', { timeZone: 'UTC' })
		);
		expect(intl.formatDate(date, 'time', 'en-US', { timeZone: 'UTC' })).toBe(
			date.toLocaleTimeString('en-US', { timeZone: 'UTC' })
		);
		expect(intl.formatDate(new Date(Number.NaN), 'date-time', 'en-US')).toBe('Invalid Date');
	});
});
