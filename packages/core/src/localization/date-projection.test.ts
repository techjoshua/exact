import { expect, it } from 'vitest';
import { intl } from './facade.js';

it.each([
	['date-time', 'toLocaleString', { timeZone: 'UTC' }],
	['date-time', 'toLocaleString', { era: 'short', timeZone: 'UTC' }],
	['date-time', 'toLocaleString', { timeZoneName: 'short', timeZone: 'UTC' }],
	['date', 'toLocaleDateString', { hour: 'numeric', timeZone: 'UTC' }],
	['time', 'toLocaleTimeString', { year: 'numeric', timeZone: 'UTC' }],
	['date', 'toLocaleDateString', { dateStyle: 'short' }],
	['time', 'toLocaleTimeString', { timeStyle: 'short' }],
	['date-time', 'toLocaleString', { fractionalSecondDigits: 2 }]
] as const)('matches native %s projection for %j', (projection, method, options) => {
	const value = new Date('2024-03-02T15:04:05Z');
	expect(intl.formatDate(value, projection, 'en-US', options)).toBe(
		value[method]('en-US', options)
	);
});

it.each([
	['date', { timeStyle: 'short' }],
	['time', { dateStyle: 'short' }]
] as const)('retains native style errors for %s', (projection, options) => {
	expect(() => intl.formatDate(new Date(), projection, 'en-US', options)).toThrow(TypeError);
});

it('reads the native Date value without invoking an overridden getTime', () => {
	let calls = 0;
	class DerivedDate extends Date {
		override getTime() {
			calls++;
			return Number.isNaN(super.getTime()) ? 0 : Number.NaN;
		}
	}
	for (const value of [new DerivedDate('2024-03-02T15:04:05Z'), new DerivedDate(Number.NaN)]) {
		expect(intl.formatDate(value, 'date', 'en-US', { timeZone: 'UTC' })).toBe(
			value.toLocaleDateString('en-US', { timeZone: 'UTC' })
		);
	}
	expect(calls).toBe(0);
});
