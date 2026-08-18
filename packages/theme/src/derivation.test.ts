import { describe, expect, it } from 'vitest';
import { parseThemeColor, resolveColor } from './color.js';
import { builtInThemeKeys } from './components.js';
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

	it('moves the alternating categorical band lighter in both appearances', () => {
		for (const appearance of ['light', 'dark'] as const)
			for (const keyColor of Object.values(builtInThemeKeys)) {
				const themed = resolveTheme({
					source: { keyColor, temperament: 'balanced' },
					environment: { appearance, contrast: 'standard', motion: 'full' }
				});
				const result = deriveDataColors(themed, { kind: 'categorical', count: 3 });
				const lightness = result.colors.map((color) => parseThemeColor(color).l);
				expect(lightness[1]).toBeGreaterThan(lightness[0]!);
				expect(lightness[2]).toBe(lightness[0]);
			}
	});

	it('reserves semantic accent outside every categorical palette', () => {
		for (const appearance of ['light', 'dark'] as const)
			for (const keyColor of Object.values(builtInThemeKeys)) {
				const themed = resolveTheme({
					source: { keyColor, temperament: 'balanced' },
					environment: { appearance, contrast: 'standard', motion: 'full' }
				});
				const result = deriveDataColors(themed, { kind: 'categorical', count: 12 });
				expect(result.colors).toHaveLength(12);
				for (const color of result.colors)
					expect(
						oklabDistance(themed.tones.accent.solid, resolveColor(parseThemeColor(color)))
					).toBeGreaterThanOrEqual(0.0799);
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

function oklabDistance(
	a: ReturnType<typeof resolveColor>,
	b: ReturnType<typeof resolveColor>
): number {
	const coordinates = (color: ReturnType<typeof resolveColor>) => {
		const angle = (color.oklch.h * Math.PI) / 180;
		return [
			color.oklch.l,
			color.oklch.c * Math.cos(angle),
			color.oklch.c * Math.sin(angle)
		] as const;
	};
	const x = coordinates(a),
		y = coordinates(b);
	return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
