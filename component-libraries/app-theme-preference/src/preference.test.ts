import { describe, expect, it } from 'vitest';
import {
	parseStoredThemeAppearance,
	resolveThemeAppearance,
	toggleThemeAppearance
} from './preference.js';

describe('shared application theme preference', () => {
	it('delegates system and preserves explicit overrides', () => {
		expect(resolveThemeAppearance('system', 'dark')).toBe('dark');
		expect(resolveThemeAppearance('light', 'dark')).toBe('light');
	});

	it('returns to system when the toggled target matches it', () => {
		expect(toggleThemeAppearance('light', 'dark')).toBe('system');
		expect(toggleThemeAppearance('dark', 'light')).toBe('system');
		expect(toggleThemeAppearance('dark', 'dark')).toBe('light');
		expect(toggleThemeAppearance('light', 'light')).toBe('dark');
	});

	it('rejects unknown storage values', () => {
		expect(parseStoredThemeAppearance('sepia')).toBe('system');
		expect(parseStoredThemeAppearance(null)).toBe('system');
	});
});
