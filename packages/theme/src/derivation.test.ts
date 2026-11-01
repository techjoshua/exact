import { describe, expect, it } from 'vitest';
import { verifyThemeDerivationValues } from '../../component-composition-corpus/test-support/theme-derivation-journey.mjs';
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
	it('matches the public cross-runtime ownership journey', () => {
		expect(
			verifyThemeDerivationValues({
				resolveTheme,
				createThemeDeriver,
				deriveTheme,
				deriveDataColors
			})
		).toBe(true);
	});
	it('runs versioned derivers with typed color helpers', () => {
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
		expect(Object.isFrozen(result)).toBe(false);
	});

	it('retains writable aliases and nested values returned by application derivers', () => {
		const output = { nested: { value: 1 } };
		const deriver = createThemeDeriver({
			id: 'fixture.alias',
			version: 1,
			derive: () => output
		});
		const result = deriveTheme(theme, deriver, {});
		expect(result).toBe(output);
		output.nested.value = 2;
		expect(result.nested.value).toBe(2);
		const alias: { version: number } = deriver;
		alias.version = 2;
		expect(deriver.version).toBe(2);
	});

	it('retains shallow TypeScript readonly checks', () => {
		const deriver = createThemeDeriver({
			id: 'fixture.types',
			version: 1,
			derive: () => ({ value: 1, nested: { value: 1 } })
		});
		const result = deriveTheme(theme, deriver, {});
		if (false) {
			// @ts-expect-error Readonly prevents direct property assignment.
			result.value = 2;
			// @ts-expect-error Deriver definitions retain their readonly declarations.
			deriver.version = 2;
		}
		result.nested.value = 2;
		expect(result.nested.value).toBe(2);
	});

	it('keeps helper envelopes writable without changing another derivation', () => {
		const deriver = createThemeDeriver({
			id: 'fixture.helpers',
			version: 1,
			derive(context: ThemeDerivationContext) {
				const palette = context.tonalPalette('accent');
				const alias: { hue: number } = palette;
				alias.hue = 12;
				const contextAlias: { sourceFingerprint: string } = context;
				contextAlias.sourceFingerprint = 'observed';
				return { hue: palette.hue, fingerprint: context.sourceFingerprint };
			}
		});
		expect(deriveTheme(theme, deriver, {})).toEqual({ hue: 12, fingerprint: 'observed' });
		expect(theme.fingerprint).not.toBe('observed');
	});

	it('accepts shared output children and rejects ancestor cycles', () => {
		const child = { value: 1 };
		const shared = { first: child, second: child };
		const make = (output: object) =>
			createThemeDeriver({
				id: 'fixture.graph',
				version: 1,
				derive: () => output
			});
		expect(deriveTheme(theme, make(shared), {})).toBe(shared);
		const cycle: { self?: unknown } = {};
		cycle.self = cycle;
		expect(() => deriveTheme(theme, make(cycle), {})).toThrow(/acyclic/);
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
			const alias = first.colors as string[];
			alias[0] = '#abcdef';
			expect(first.colors[0]).toBe('#abcdef');
			expect(second.colors[0]).not.toBe('#abcdef');
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
