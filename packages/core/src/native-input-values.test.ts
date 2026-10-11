import { expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { formatNativeInputValue, isNativeInputDate } from './native-input-values.js';
import { projectedAttributes } from './component-abi/text-projection-markup.js';

it.each([
	['date', Date.UTC(2026, 0, 2, 3), '2026-01-02'],
	['DATE', Date.UTC(2026, 0, 2), '2026-01-02'],
	['datetime-local', Date.UTC(2026, 0, 2, 3, 4), '2026-01-02T03:04'],
	['datetime-local', Date.UTC(2026, 0, 2, 3, 4, 5, 6), '2026-01-02T03:04:05.006'],
	['time', 0, '00:00'],
	['time', -1, '23:59:59.999'],
	['time', 86_400_010, '00:00:00.01'],
	['month', 0, '1970-01'],
	['month', -1, '1969-12'],
	['month', -12, '1969-01'],
	['month', -13, '1968-12'],
	['month', 672, '2026-01'],
	['week', Date.UTC(2025, 11, 29), '2026-W01'],
	['week', Date.UTC(2021, 0, 1), '2020-W53'],
	['week', Date.UTC(2021, 0, 4), '2021-W01'],
	['date', NaN, ''],
	['week', Infinity, ''],
	['datetime-local', 9e15, ''],
	['date', -62_167_219_200_000, '']
] as const)('formats %s numeric value %s as %s', (type, value, expected) => {
	expect(formatNativeInputValue(value, type)).toBe(expected);
});

it('preserves strings, empty values, and non-temporal values for their existing owners', () => {
	const date = new Date('2026-01-02');
	for (const value of ['2026-01-02', null, undefined])
		expect(formatNativeInputValue(value, 'date')).toBe(value);
	expect(formatNativeInputValue(date, 'text')).toBe(date);
	for (const type of ['text', 'number', 'range', undefined])
		expect(formatNativeInputValue(7, type)).toBe(7);
});

it('retains numeric temporal values in inert markup without converting ordinary strings', () => {
	for (const [type, value, text] of [
		['date', Date.UTC(2026, 0, 2), '2026-01-02'],
		['datetime-local', Date.UTC(2026, 0, 2, 3, 4), '2026-01-02T03:04'],
		['time', 11_040_000, '03:04'],
		['month', 672, '2026-01'],
		['week', Date.UTC(2025, 11, 29), '2026-W01']
	] as const) {
		expect(projectedAttributes({ value, type }, 'input', {})).toBe(
			` value="${text}" type="${type}"`
		);
		expect(projectedAttributes({ value: text, type }, 'input', {})).toBe(
			` value="${text}" type="${type}"`
		);
	}
});

it.each([
	[2026, 'date'],
	[2026, 'DATE'],
	[10000, 'date'],
	[10000, 'DATE']
] as const)(
	'serializes native Date year %s through %s using HTML calendar values',
	(year, type) => {
		const value = new Date(0);
		value.setUTCFullYear(year, 0, 2);
		expect(projectedAttributes({ type, value }, 'input', {})).toBe(
			` type="${type}" value="${year}-01-02"`
		);
	}
);

it('formats document-realm native Dates without accepting a forged Date tag', () => {
	const date = runInNewContext("new Date('2026-01-02T00:00:00.000Z')") as Date;
	expect(date instanceof Date).toBe(false);
	expect(isNativeInputDate(date)).toBe(true);
	expect(formatNativeInputValue(date, 'DATE')).toBe('2026-01-02');
	expect(projectedAttributes({ type: 'DATE', value: date }, 'input', {})).toContain(
		'value="2026-01-02"'
	);
	const spoof = { [Symbol.toStringTag]: 'Date', getTime: () => date.getTime() };
	expect(isNativeInputDate(spoof)).toBe(false);
	expect(formatNativeInputValue(spoof, 'date')).toBe(spoof);
	for (const value of [new Date(NaN), runInNewContext('new Date(NaN)')]) {
		expect(isNativeInputDate(value)).toBe(true);
		expect(formatNativeInputValue(value, 'date')).toBe('');
	}
});
