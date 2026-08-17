import { describe, expect, it } from 'vitest';
import { createThemeDeriver, deriveDataColors, deriveTheme } from './derivation.js';
import type { ThemeDerivationContext } from './derivation-contracts.js';
import { resolveTheme } from './resolver.js';

const theme = resolveTheme({
	source: { keyColor: '#2367d1' },
	environment: { appearance: 'light', contrast: 'standard', motion: 'full' }
});

describe('exterior theme derivation', () => {
	it('runs versioned derivers with immutable helpers', () => {
		const deriver = createThemeDeriver({
			id: 'fixture.syntax',
			version: 1,
			derive(context: ThemeDerivationContext, input: { tone: number }) {
				return {
					key: context.key.css,
					shade: context.tonalPalette('accent').at(input.tone).css,
					safe: context.ensureContrast('#777', [context.surfaces[0].background], 4.5).css
				};
			}
		});
		const result = deriveTheme(theme, deriver, { tone: 45 });
		expect(result.key).toBe(theme.key.css);
		expect(result.shade).toMatch(/^oklch\(/);
		expect(Object.isFrozen(result)).toBe(true);
	});

	it('generates deterministic, opaque chart channels and independent patterns', () => {
		for (const request of [
			{ kind: 'categorical', count: 6 },
			{ kind: 'sequential', steps: 6, source: 'info' },
			{ kind: 'diverging', steps: 7 }
		] as const) {
			const first = deriveDataColors(theme, request);
			const second = deriveDataColors(theme, request);
			expect(first).toEqual(second);
			expect(first.colors).toHaveLength(
				request.kind === 'categorical' ? request.count : request.steps
			);
			expect(first.foregrounds).toHaveLength(first.colors.length);
			expect(first.recommendedPatterns.slice(0, 4)).toEqual([
				'solid',
				'diagonal',
				'crosshatch',
				'dots'
			]);
			expect(Object.isFrozen(first.colors)).toBe(true);
		}
	});

	it('validates bounded derivation inputs', () => {
		expect(() => createThemeDeriver({ id: '', version: 1, derive: () => ({}) })).toThrow(TypeError);
		expect(() => deriveDataColors(theme, { kind: 'categorical', count: 13 })).toThrow(RangeError);
		const reserved = createThemeDeriver({
			id: 'fixture.reserved',
			version: 1,
			derive: () => ({ '--exact-theme-accent-solid': 'red' })
		});
		expect(() => deriveTheme(theme, reserved, {})).toThrow(/reserved CSS variables/);
	});
});
