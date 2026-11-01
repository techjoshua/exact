import { verifyThemeCacheOwnership } from '../../component-composition-corpus/test-support/theme-derivation-journey.mjs';
import { beforeEach, expect, it, vi } from 'vitest';

const environment = { appearance: 'light', contrast: 'standard', motion: 'full' } as const;

beforeEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

it('reuses palette work across fresh scopes without sharing preference ownership', async () => {
	const palette = await import('./palette-resolution.js');
	const surfaces = vi.spyOn(palette, 'createSurfaces');
	const { createThemeScopeDefinition, createThemeScopePresentation, resolveThemeScope } =
		await import('./system-theme.js');
	const first = createThemeScopeDefinition({ appearance: 'system' });
	const firstPresentation = createThemeScopePresentation(first);
	const calls = surfaces.mock.calls.length;
	const second = createThemeScopeDefinition({ appearance: 'system' });
	expect(createThemeScopePresentation(second)).toEqual(firstPresentation);
	expect(surfaces).toHaveBeenCalledTimes(calls);
	expect(resolveThemeScope(first, environment).source.appearance).toBe('light');
	expect(resolveThemeScope(second, { ...environment, appearance: 'dark' }).source.appearance).toBe(
		'dark'
	);
	expect(resolveThemeScope(first, environment).source.appearance).toBe('light');
});

it('preserves input diagnostics and validates inputs even after warming an equivalent theme', async () => {
	const { resolveTheme } = await import('./resolver.js');
	const mapped = resolveTheme({ source: { keyColor: 'oklch(0.5 0.8 20)' }, environment });
	expect(mapped.warnings.some((warning) => warning.code === 'source-gamut-mapped')).toBe(true);
	const inherited = resolveTheme({ parent: mapped, environment });
	expect(inherited.key).toEqual(mapped.key);
	expect(inherited.warnings.some((warning) => warning.code === 'source-gamut-mapped')).toBe(false);
	expect(resolveTheme({ source: { keyColor: 'oklch(0.5 0.8 20)' }, environment })).toEqual(mapped);
	expect(() => resolveTheme({ source: { canvasColor: 'transparent' }, environment })).toThrow();
});

it('retains full-precision inspected values when display fingerprints coincide', async () => {
	const { resolveTheme } = await import('./resolver.js');
	const first = resolveTheme({ source: { keyColor: 'oklch(0.5 0.05 20)' }, environment });
	const second = resolveTheme({ source: { keyColor: 'oklch(0.500000001 0.05 20)' }, environment });
	expect(second.fingerprint).toBe(first.fingerprint);
	expect(second.key.oklch.l).toBe(0.500000001);
	expect(first.key.oklch.l).toBe(0.5);
});

it('evicts old results while preserving recently reused themes and their values', async () => {
	const palette = await import('./palette-resolution.js');
	const surfaces = vi.spyOn(palette, 'createSurfaces');
	const { resolveTheme } = await import('./resolver.js');
	const resolve = (index: number) =>
		resolveTheme({
			source: { typography: { body: `Font${index}` } },
			environment
		});
	const first = resolve(0);
	const second = resolve(1);
	for (let index = 2; index < 32; index++) resolve(index);
	expect(resolve(0)).toEqual(first);
	resolve(32);
	const calls = surfaces.mock.calls.length;
	expect(resolve(0)).toEqual(first);
	expect(surfaces).toHaveBeenCalledTimes(calls);
	expect(resolve(1)).toEqual(second);
	expect(surfaces).toHaveBeenCalledTimes(calls + 1);
});

it('bypasses retention for large custom sources without changing their output', async () => {
	const palette = await import('./palette-resolution.js');
	const surfaces = vi.spyOn(palette, 'createSurfaces');
	const { resolveTheme } = await import('./resolver.js');
	const font = '"'.repeat(2048);
	const input = { source: { typography: { body: font, display: font, code: font } }, environment };
	const first = resolveTheme(input);
	const calls = surfaces.mock.calls.length;
	expect(resolveTheme(input)).toEqual(first);
	expect(surfaces).toHaveBeenCalledTimes(calls + 1);
});

it('preserves signed zero in custom temperament inspection', async () => {
	const { builtInTemperaments, resolveTheme } = await import('./resolver.js');
	const source = { temperament: { ...builtInTemperaments.balanced, trackingInterval: 0 } };
	const positive = resolveTheme({ source, environment });
	const negative = resolveTheme({
		source: { temperament: { ...source.temperament, trackingInterval: -0 } },
		environment
	});
	expect(Object.is(positive.source.temperament.trackingInterval, 0)).toBe(true);
	expect(Object.is(negative.source.temperament.trackingInterval, -0)).toBe(true);
});

it('keeps requested preferences distinct when all eight resolved branches coincide', async () => {
	const { createThemeScopeDefinition, createThemeScopePresentation } = await import(
		'./system-theme.js'
	);
	const parent = createThemeScopeDefinition({
		appearance: 'dark',
		contrast: 'standard',
		motion: 'full'
	});
	const explicit = createThemeScopePresentation(
		createThemeScopeDefinition({ appearance: 'light' }, parent)
	);
	const inverse = createThemeScopePresentation(
		createThemeScopeDefinition({ appearance: 'inverse' }, parent)
	);
	expect(explicit.style).toBe(inverse.style);
	expect(explicit.css).toBe(inverse.css);
	expect(explicit.preferences.appearance).toBe('light');
	expect(inverse.preferences.appearance).toBe('inverse');
});

it('does not retain arbitrary source resources or invoke serialization hooks for cache lookup', async () => {
	const { resolveTheme } = await import('./resolver.js');
	const { reuseResolvedTheme } = await import('./resolution-cache.js');
	const theme = resolveTheme({ environment });
	const hook = vi.fn(() => 'same');
	const source = { ...theme.source, temperament: { ...theme.source.temperament, toJSON: hook } };
	const create = vi.fn(() => theme);
	reuseResolvedTheme(source, [], create);
	reuseResolvedTheme(source, [], create);
	expect(hook).not.toHaveBeenCalled();
	expect(create).toHaveBeenCalledTimes(2);
});

it('keeps mutable resolved observations separate from reusable palette data', async () => {
	const { resolveTheme } = await import('./resolver.js');
	const first = resolveTheme({ source: { keyColor: '#2367d1' }, environment });
	const canvas = first.tokens.canvas;
	const lightness = first.key.oklch.l;
	const tokenAlias: { canvas: string } = first.tokens;
	const colorAlias: { l: number } = first.key.oklch;
	tokenAlias.canvas = 'hotpink';
	colorAlias.l = 0;
	const next = resolveTheme({ source: { keyColor: '#2367d1' }, environment });
	expect(first.tokens.canvas).toBe('hotpink');
	expect(first.key.oklch.l).toBe(0);
	expect(next.tokens.canvas).toBe(canvas);
	expect(next.key.oklch.l).toBe(lightness);
	expect(Object.getPrototypeOf(next.tones)).toBeNull();
});

it('observes scope definition mutations without sharing presentation observations', async () => {
	const { createThemeScopeDefinition, createThemeScopePresentation, resolveThemeScope } =
		await import('./system-theme.js');
	const definition = createThemeScopeDefinition({ keyColor: '#2367d1', appearance: 'light' });
	const first = resolveThemeScope(definition, environment);
	const alias: { keyColor?: unknown } = definition.source;
	alias.keyColor = '#d97706';
	const next = resolveThemeScope(definition, environment);
	expect(next.key.css).not.toBe(first.key.css);
	const presentation = createThemeScopePresentation(definition);
	const css = presentation.css;
	const presentationAlias: { css: string } = presentation;
	const preferencesAlias: { appearance: string } = presentation.preferences;
	presentationAlias.css = 'authored';
	preferencesAlias.appearance = 'dark';
	const repeated = createThemeScopePresentation(definition);
	expect(repeated.css).toBe(css);
	expect(repeated.preferences.appearance).toBe('light');
});

it('copies custom temperament intervals without freezing caller-owned data', async () => {
	const { builtInTemperaments, resolveTheme } = await import('./resolver.js');
	const surfaceIntervals: [number, number, number] = [0.012, 0.014, 0.016];
	const temperament = { ...builtInTemperaments.balanced, id: 'owned-intervals', surfaceIntervals };
	const theme = resolveTheme({ source: { temperament }, environment });
	surfaceIntervals[0] = 0.02;
	expect(surfaceIntervals[0]).toBe(0.02);
	expect(theme.source.temperament.surfaceIntervals[0]).toBe(0.012);
});

it('captures custom temperament fields before validating and publishing them', async () => {
	const { builtInTemperaments } = await import('./resolver.js');
	const { resolveTemperament } = await import('./source-resolution.js');
	let reads = 0;
	const temperament = {
		...builtInTemperaments.balanced,
		get surfaceIntervals(): readonly [number, number, number] {
			reads++;
			return reads === 1 ? [0.012, 0.014, 0.016] : [9, 9, 9];
		}
	};
	expect(resolveTemperament(temperament).surfaceIntervals).toEqual([0.012, 0.014, 0.016]);
	expect(reads).toBe(1);
});

it('rejects sparse intervals and ignores authored array validation methods', async () => {
	const { builtInTemperaments } = await import('./resolver.js');
	const { resolveTemperament } = await import('./source-resolution.js');
	const sparse: [number, number, number] = [0.012, 0.014, 0.016];
	Reflect.deleteProperty(sparse, '1');
	const invalid: [number, number, number] = [9, 9, 9];
	invalid.some = () => false;
	for (const surfaceIntervals of [sparse, invalid])
		expect(() => resolveTemperament({ ...builtInTemperaments.balanced, surfaceIntervals })).toThrow(
			/surfaceIntervals/
		);
});

it('matches the built cross-runtime palette ownership journey', async () => {
	const { resolveTheme, builtInTemperaments } = await import('./resolver.js');
	const { createThemeScopeDefinition, createThemeScopePresentation, resolveThemeScope } =
		await import('./system-theme.js');
	const { exactThemeContract } = await import('./token-contract.js');
	const { serializeThemeOverrides } = await import('./overrides.js');
	expect(
		verifyThemeCacheOwnership({
			resolveTheme,
			builtInTemperaments,
			createThemeScopeDefinition,
			createThemeScopePresentation,
			resolveThemeScope,
			exactThemeContract,
			serializeThemeOverrides
		})
	).toBe(true);
});

it('captures inherited temperament accessors using their original receiver', async () => {
	const { resolveTemperament } = await import('./source-resolution.js');
	const { builtInTemperaments } = await import('./resolver.js');
	let reads = 0;
	const prototype = {
		...builtInTemperaments.balanced,
		get trackingInterval() {
			reads++;
			return reads === 1 ? 0.025 : 9;
		}
	};
	const source = Object.create(prototype) as typeof prototype;
	const captured = resolveTemperament(source);
	expect(captured.trackingInterval).toBe(0.025);
	expect(reads).toBe(1);
});

it('preserves opaque class metadata without retaining it in shared palette caches', async () => {
	const { resolveTheme, builtInTemperaments } = await import('./resolver.js');
	const palette = await import('./palette-resolution.js');
	const surfaces = vi.spyOn(palette, 'createSurfaces');
	const metadata = new Date(0);
	const input = {
		source: { temperament: { ...builtInTemperaments.balanced, metadata } },
		environment
	};
	const first = resolveTheme(input);
	const next = resolveTheme(input);
	expect(surfaces).toHaveBeenCalledTimes(2);
	const observed = first.source.temperament as typeof input.source.temperament;
	expect(observed.metadata).toBe(metadata);
	expect(observed.metadata.getTime()).toBe(0);
	expect(next).toEqual(first);
});
