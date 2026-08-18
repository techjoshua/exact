import {
	builtInTemperaments,
	builtInThemeKeys,
	deriveTheme,
	resolveTheme,
	type BuiltInTemperament
} from '@exactjs/theme';
import { describe, expect, it } from 'vitest';
import { vividSyntaxTheme } from './syntax-theme.js';

describe('documentation syntax theme', () => {
	it('derives vivid semantic colors while preserving monochrome temperament', () => {
		for (const appearance of ['light', 'dark'] as const)
			for (const keyColor of Object.values(builtInThemeKeys))
				for (const temperament of Object.keys(builtInTemperaments) as BuiltInTemperament[]) {
					const theme = resolveTheme({
						source: { keyColor, temperament },
						environment: { appearance, contrast: 'standard', motion: 'full' }
					});
					const palette = deriveTheme(theme, vividSyntaxTheme, {});
					for (const color of [
						palette.keyword,
						palette.type,
						palette.function,
						palette.string,
						palette.number
					]) {
						const chroma = Number(color.match(/oklch\([^ ]+ ([^ ]+)/)?.[1]);
						if (temperament === 'monochrome') expect(chroma).toBe(0);
						else expect(chroma).toBeGreaterThanOrEqual(0.11);
					}
				}
	});
});
