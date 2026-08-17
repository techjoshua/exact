import { describe, expect, it } from 'vitest';
import type { BuiltInTemperament, ResolvedTheme, ThemeAppearance } from './contracts.js';
import { contrastRatio } from './color.js';
import { ThemeResolutionError } from './errors.js';
import { builtInTemperaments, resolveTheme, serializeThemeVariables } from './resolver.js';
import { exactThemeContract, themeSurfaceBundles, themeTones } from './token-contract.js';

const environment = { appearance: 'light', contrast: 'standard', motion: 'full' } as const;

describe('deterministic theme resolution', () => {
	it('publishes every exact-theme/1 token in lexical order', () => {
		const theme = resolveTheme({ environment });
		expect(Object.keys(theme.tokens).sort()).toEqual(Object.keys(exactThemeContract.tokens).sort());
		const variables = serializeThemeVariables(theme);
		expect(Object.keys(variables)).toEqual(Object.keys(variables).sort());
		expect(Object.getPrototypeOf(variables)).toBeNull();
		expect(Object.isFrozen(theme)).toBe(true);
		expect(Object.isFrozen(theme.tones.accent)).toBe(true);
	});

	it('keeps all built-in foreground, boundary, focus, and solid pairs above their contract ratios', () => {
		for (const appearance of ['light', 'dark'] as const)
			for (const contrast of ['standard', 'more'] as const)
				for (const temperament of Object.keys(builtInTemperaments) as BuiltInTemperament[]) {
					const theme = resolveTheme({
						source: { temperament },
						environment: { appearance, contrast, motion: 'full' }
					});
					expect(theme.warnings).toEqual([]);
					const textRatio = contrast === 'more' ? 7 : 4.5;
					const boundaryRatio = contrast === 'more' ? 4.5 : 3;
					for (const bundle of themeSurfaceBundles) {
						const surface = theme.surfaces[bundle];
						expect(contrastRatio(surface.foreground, surface.background)).toBeGreaterThanOrEqual(
							textRatio - 0.02
						);
						expect(
							contrastRatio(surface.foregroundMuted, surface.background)
						).toBeGreaterThanOrEqual(textRatio - 0.02);
						expect(contrastRatio(surface.border, surface.background)).toBeGreaterThanOrEqual(
							boundaryRatio - 0.02
						);
					}
					for (const tone of themeTones)
						expect(
							contrastRatio(theme.tones[tone].onSolid, theme.tones[tone].solid)
						).toBeGreaterThanOrEqual(4.48);
				}
	});

	it('keeps every temperament surface level distinct in light and dark appearances', () => {
		for (const appearance of ['light', 'dark'] as const)
			for (const temperament of Object.keys(builtInTemperaments) as BuiltInTemperament[]) {
				const theme = resolvePreset(temperament, appearance);
				const levels = [0, 1, 2, 3].map(
					(level) => theme.surfaces[level as 0 | 1 | 2 | 3].background.oklch.l
				);
				for (let index = 1; index < levels.length; index++)
					expect(levels[index]! - levels[index - 1]!).toBeGreaterThanOrEqual(0.0039);
			}
	});

	it('gives named temperaments distinct tonal, chromatic, state, and status behavior', () => {
		for (const appearance of ['light', 'dark'] as const) {
			const balanced = resolvePreset('balanced', appearance);
			const restrained = resolvePreset('restrained', appearance);
			const expressive = resolvePreset('expressive', appearance);
			const dramatic = resolvePreset('dramatic', appearance);
			const soft = resolvePreset('soft', appearance);
			const stark = resolvePreset('stark', appearance);
			const monochrome = resolvePreset('monochrome', appearance);

			expect(surfaceSpan(soft)).toBeLessThan(surfaceSpan(restrained));
			expect(surfaceSpan(restrained)).toBeLessThan(surfaceSpan(balanced));
			expect(surfaceSpan(balanced)).toBeLessThan(surfaceSpan(expressive));
			expect(surfaceSpan(expressive)).toBeLessThan(surfaceSpan(dramatic));
			expect(surfaceSpan(dramatic)).toBeLessThan(surfaceSpan(stark));

			expect(stateSpan(soft)).toBeLessThan(stateSpan(restrained));
			expect(stateSpan(restrained)).toBeLessThan(stateSpan(balanced));
			expect(stateSpan(balanced)).toBeLessThan(stateSpan(expressive));
			expect(stateSpan(expressive)).toBeLessThan(stateSpan(dramatic));
			expect(stateSpan(dramatic)).toBeLessThan(stateSpan(stark));

			expect(soft.tones.accent.solid.oklch.c).toBeLessThan(restrained.tones.accent.solid.oklch.c);
			expect(dramatic.tones.accent.solid.oklch.c).toBeLessThan(
				expressive.tones.accent.solid.oklch.c
			);
			expect(expressive.tones.info.solid.oklch.c).toBeGreaterThan(
				balanced.tones.info.solid.oklch.c
			);
			for (const tone of themeTones) expect(monochrome.tones[tone].solid.oklch.c).toBe(0);
		}
	});

	it('accepts every documented context-free color family and DTCG shape', () => {
		const values = [
			'#16737a',
			'rebeccapurple',
			'rgb(20 80 90)',
			'hsl(185 60% 30%)',
			'hwb(185 10% 20%)',
			'lab(50% 0 0)',
			'lch(50% 30 185)',
			'oklab(0.54 -0.07 -0.02)',
			'oklch(0.54 0.09 185)',
			'color(srgb 0.1 0.4 0.45)',
			'color(display-p3 0.1 0.4 0.45)'
		] as const;
		for (const keyColor of values)
			expect(resolveTheme({ source: { keyColor }, environment }).key.css).toMatch(/^oklch\(/);
		for (const colorSpace of ['srgb', 'display-p3', 'oklab', 'oklch'] as const)
			expect(
				resolveTheme({
					source: { keyColor: { colorSpace, components: [0.4, 0.05, 0.1] } },
					environment
				}).key.css
			).toMatch(/^oklch\(/);
	});

	it('inherits omitted fields while retaining nested choices', () => {
		const parent = resolveTheme({
			source: { keyColor: '#2367d1', density: 'spacious', temperament: 'soft' },
			environment
		});
		const nested = resolveTheme({ parent, source: { temperament: 'dramatic' }, environment });
		expect(nested.key.css).toBe(parent.key.css);
		expect(nested.source.density).toBe('spacious');
		expect(nested.source.temperament.id).toBe('dramatic');
		expect(nested.surfaces[0]).not.toBe(parent.surfaces[0]);
	});

	it('keeps pill controls fully rounded while bounding container geometry', () => {
		const theme = resolveTheme({ source: { shape: 'pill' }, environment });
		expect(theme.tokens['radius-sm']).toBe('9999px');
		expect(theme.tokens['radius-md']).toBe('9999px');
		expect(theme.tokens['radius-lg']).toBe('1.5rem');
		expect(theme.tokens['radius-pill']).toBe('9999px');
	});

	it('gives dark elevation progressively lighter visible shadows', () => {
		const dark = resolveTheme({
			source: { depth: 'elevated' },
			environment: { ...environment, appearance: 'dark' }
		});
		expect(dark.tokens['shadow-sm']).toContain('0 2px 6px rgb(255 255 255 / 0.10)');
		expect(dark.tokens['shadow-md']).toContain('0 5px 16px rgb(255 255 255 / 0.14)');
		expect(dark.tokens['shadow-lg']).toContain('0 12px 32px rgb(255 255 255 / 0.18)');
		expect(dark.tokens['surface-sunken-shadow']).toContain('inset 0 2px 4px');
		expect(
			resolveTheme({ source: { depth: 'elevated' }, environment }).tokens['shadow-sm']
		).not.toContain('rgb(255 255 255');
	});

	it('has a stable independent default fixture', () => {
		const theme = resolveTheme({ environment });
		expect({
			fingerprint: theme.fingerprint,
			key: theme.key.css,
			canvas: theme.tokens.canvas,
			accent: theme.tokens['accent-solid'],
			medium: theme.tokens['control-height-md']
		}).toEqual({
			fingerprint: 'nhaoymziq8-mlyc5msugfmy_6iu3wnwfqwn-sbcxig8',
			key: 'oklch(0.54 0.09 185)',
			canvas: 'oklch(0.97 0.0108 185)',
			accent: 'oklch(0.54 0.09 185)',
			medium: '2.5rem'
		});
	});

	it('rejects context-dependent, malformed, translucent-root, and invalid source values', () => {
		for (const keyColor of [
			'var(--brand)',
			'currentColor',
			'color-mix(in oklch, red, blue)',
			'#12'
		])
			expect(() => resolveTheme({ source: { keyColor }, environment })).toThrow(
				ThemeResolutionError
			);
		expect(() => resolveTheme({ source: { keyColor: 'rgb(0 0 0 / .5)' }, environment })).toThrow(
			/requires an explicit opaque canvasColor/
		);
		expect(() =>
			resolveTheme({
				source: {
					typography: {
						body: 'serif;',
						display: 'serif',
						code: 'monospace',
						baseSizeRem: 1,
						scaleRatio: 1.2,
						bodyLineHeight: 1.5,
						headingLineHeight: 1.2
					}
				},
				environment
			})
		).toThrow(ThemeResolutionError);
	});
});

function resolvePreset(
	temperament: BuiltInTemperament,
	appearance: ThemeAppearance
): ResolvedTheme {
	return resolveTheme({
		source: { keyColor: '#167a75', temperament },
		environment: { appearance, contrast: 'standard', motion: 'full' }
	});
}

function surfaceSpan(theme: ResolvedTheme): number {
	return theme.surfaces[3].background.oklch.l - theme.surfaces[0].background.oklch.l;
}

function stateSpan(theme: ResolvedTheme): number {
	return Math.abs(theme.tones.accent.solidActive.oklch.l - theme.tones.accent.solid.oklch.l);
}
