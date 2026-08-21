import type {
	ResolvedTheme,
	ResolvedThemeSource,
	ResolvedTone,
	ThemeResolutionInput,
	ThemeTokenName,
	ThemeTone,
	ThemeWarning
} from './contracts.js';
import { parseThemeColor, resolveColor } from './color.js';
import { ThemeResolutionError } from './errors.js';
import {
	createSurfaces,
	createThemeTokens,
	createTone,
	toneFamilies
} from './palette-resolution.js';
import {
	builtInTemperaments,
	freezeThemeValue,
	isResolvedColor,
	resolveSourceColor,
	resolveTemperament,
	resolveTypography,
	selectThemeAxis,
	validateThemeEnvironment
} from './source-resolution.js';
import { fingerprintThemeSource } from './theme-fingerprint.js';
import { exactThemeContract, themeTones } from './token-contract.js';

export { builtInTemperaments };

/**
 * Resolves a compact source into the complete immutable exact-theme/1 contract.
 * @exact pure
 */
export function resolveTheme(input: ThemeResolutionInput): ResolvedTheme {
	if (!input || !input.environment)
		throw new ThemeResolutionError(
			'invalid-source',
			'environment',
			'Theme resolution requires explicit system preferences'
		);
	validateThemeEnvironment(input.environment);
	const warnings: ThemeWarning[] = [];
	const parent = input.parent,
		source = input.source ?? {};
	const appearance = selectThemeAxis(
		source.appearance,
		parent?.source.appearance,
		input.environment.appearance
	);
	const contrast = selectThemeAxis(
		source.contrast,
		parent?.source.contrast,
		input.environment.contrast
	);
	const motion = selectThemeAxis(source.motion, parent?.source.motion, input.environment.motion);
	const density = selectThemeAxis(source.density, parent?.source.density, 'comfortable');
	const shape = selectThemeAxis(source.shape, parent?.source.shape, 'soft');
	const depth = selectThemeAxis(source.depth, parent?.source.depth, 'bordered');
	const temperament = resolveTemperament(
		source.temperament ?? parent?.source.temperament ?? 'balanced'
	);
	const typography = resolveTypography(source.typography ?? parent?.source.typography ?? 'system');

	const explicitCanvas =
		source.canvasColor !== undefined && source.canvasColor !== 'auto'
			? parseThemeColor(source.canvasColor, 'source.canvasColor')
			: undefined;
	if (explicitCanvas && explicitCanvas.alpha !== 1)
		throw new ThemeResolutionError(
			'invalid-color',
			'source.canvasColor',
			'Theme canvasColor must be opaque'
		);
	const canvasSource = explicitCanvas ? resolveColor(explicitCanvas) : undefined;
	const compositeBackground =
		canvasSource ??
		(parent
			? resolveColor(parseThemeColor(parent.tokens.canvas, 'parent.tokens.canvas'))
			: undefined);
	const key =
		source.keyColor === undefined && parent
			? parent.key
			: resolveSourceColor(
					source.keyColor ?? 'oklch(0.54 0.09 185)',
					'source.keyColor',
					compositeBackground,
					warnings
				);
	const neutralInput =
		source.neutralColor === undefined && parent
			? parent.source.neutralColor
			: (source.neutralColor ?? 'auto');
	const neutralResolved =
		neutralInput === 'auto'
			? 'auto'
			: isResolvedColor(neutralInput)
				? neutralInput
				: resolveSourceColor(neutralInput, 'source.neutralColor', compositeBackground, warnings);
	const canvasInput =
		source.canvasColor === undefined && parent
			? parent.source.canvasColor
			: (source.canvasColor ?? 'auto');
	const canvasResolved =
		canvasInput === 'auto'
			? 'auto'
			: isResolvedColor(canvasInput)
				? canvasInput
				: resolveSourceColor(canvasInput, 'source.canvasColor', undefined, warnings);

	const sourceResolved: ResolvedThemeSource = freezeThemeValue({
		keyColor: key,
		neutralColor: neutralResolved,
		canvasColor: canvasResolved,
		temperament,
		appearance,
		density,
		shape,
		depth,
		typography,
		contrast,
		motion
	});
	const accentChroma = Math.min(
		key.oklch.c * temperament.accentChromaMultiplier,
		temperament.accentChromaCap
	);
	const neutral =
		neutralResolved === 'auto'
			? resolveColor({
					l: key.oklch.l,
					c: Math.min(key.oklch.c * 0.12, temperament.neutralChromaCap),
					h: key.oklch.h
				})
			: resolveColor({
					l: neutralResolved.oklch.l,
					c: Math.min(neutralResolved.oklch.c, temperament.neutralChromaCap),
					h: neutralResolved.oklch.h
				});
	const canvas =
		canvasResolved === 'auto'
			? resolveColor({
					l: appearance === 'light' ? 0.97 : 0.11,
					c: neutral.oklch.c,
					h: neutral.oklch.h
				})
			: canvasResolved;
	const surfaces = createSurfaces(canvas, neutral, sourceResolved, warnings);
	const families = toneFamilies(key, neutral, accentChroma, temperament);
	const tonesResolved = Object.create(null) as Record<ThemeTone, ResolvedTone>;
	for (const tone of themeTones)
		tonesResolved[tone] = createTone(
			families[tone],
			key.oklch.l,
			surfaces,
			sourceResolved,
			warnings,
			`tones.${tone}`
		);
	const tokens = createThemeTokens(canvas, surfaces, tonesResolved, sourceResolved, warnings);
	const fingerprint = fingerprintThemeSource(sourceResolved);
	return freezeThemeValue({
		contract: 'exact-theme/1',
		fingerprint,
		source: sourceResolved,
		key,
		neutral,
		surfaces: Object.freeze(surfaces),
		tones: Object.freeze(tonesResolved),
		tokens: Object.freeze(tokens),
		warnings: Object.freeze(warnings)
	});
}

/** Converts all generated tokens into a sorted, frozen null-prototype custom-property map. */
export function serializeThemeVariables(
	theme: ResolvedTheme
): import('./contracts.js').ThemeVariableMap {
	if (theme?.contract !== 'exact-theme/1')
		throw new TypeError('serializeThemeVariables requires exact-theme/1');
	const output = Object.create(null) as Record<string, string>;
	for (const name of Object.keys(exactThemeContract.tokens).sort())
		output[`--exact-theme-${name}`] = theme.tokens[name as ThemeTokenName];
	return Object.freeze(output) as import('./contracts.js').ThemeVariableMap;
}
