import { describe, expect, it } from 'vitest';
import { createThemeOverride, serializeThemeOverrides, themeStyleAttribute } from './overrides.js';
import { ThemeResolutionError } from './errors.js';

describe('typed theme overrides', () => {
	it('creates the validated enhancement payload', () => {
		expect(createThemeOverride({ 'radius-md': { value: 1, unit: 'rem' } })).toBe(
			'--exact-theme-radius-md:1rem'
		);
	});

	it('serializes all token kinds deterministically', () => {
		const values = serializeThemeOverrides({
			'accent-solid': '#126e75',
			'space-2': { value: 0.625, unit: 'rem' },
			'line-height-body': 1.6,
			'font-body': '  Charter, serif  ',
			'duration-base': { milliseconds: 220 },
			'easing-standard': { kind: 'cubic-bezier', x1: 0.2, y1: 0, x2: 0, y2: 1 },
			'shadow-sm': [
				{
					x: { value: 0, unit: 'px' },
					y: { value: 2, unit: 'px' },
					blur: { value: 8, unit: 'px' },
					color: 'rgb(0 0 0 / 25%)'
				}
			]
		});
		expect(Object.keys(values)).toEqual(Object.keys(values).sort());
		expect(values['--exact-theme-font-body']).toBe('Charter, serif');
		expect(values['--exact-theme-duration-base']).toBe('220ms');
		expect(values['--exact-theme-shadow-sm']).toContain('/ 0.25)');
		expect(themeStyleAttribute(values)).not.toMatch(/;$/);
	});

	it('rejects the entire invalid publication', () => {
		for (const tokens of [
			{ unknown: '#fff' },
			{ 'space-2': { value: -1, unit: 'rem' } },
			{ 'accent-solid': 'rgb(0 0 0 / .5)' },
			{ 'duration-base': { milliseconds: 10001 } }
		]) {
			expect(() => serializeThemeOverrides(tokens as never)).toThrow(ThemeResolutionError);
		}
	});
});
