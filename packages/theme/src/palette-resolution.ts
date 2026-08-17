import type {
	ResolvedColor,
	ResolvedSurface,
	ResolvedThemeSource,
	ResolvedTone,
	ThemeAppearance,
	ThemeTemperament,
	ThemeTokenName,
	ThemeTone,
	ThemeWarning
} from './contracts.js';
import {
	contrastRatio,
	ensureColorContrast,
	harmonizeHue,
	orderedLightnessCandidates,
	resolveColor
} from './color.js';
import { themeSurfaceBundles, themeToneRoles, themeTones } from './token-contract.js';
import { freezeThemeValue } from './source-resolution.js';
import { structuralTokens } from './structural-tokens.js';

/** Derives the ordered semantic surface bundles for one resolved theme source. */
export function createSurfaces(
	canvas: ResolvedColor,
	neutral: ResolvedColor,
	source: ResolvedThemeSource,
	warnings: ThemeWarning[]
): Record<0 | 1 | 2 | 3 | 'sunken' | 'overlay', ResolvedSurface> {
	const light = source.appearance === 'light',
		interval = source.temperament.surfaceInterval,
		cap = light ? 0.995 : 0.42,
		origin = light
			? clamp(canvas.oklch.l - interval * 0.75, 0.04, cap - 0.015)
			: clamp(canvas.oklch.l + 0.02, 0.04, cap - 0.015),
		// Light canvases have little headroom before white. Centering the hierarchy around the canvas
		// preserves every temperament's interval instead of clipping all raised surfaces to one value.
		step = Math.min(Math.max(interval * (light ? 0.45 : 0.65), 0.004), (cap - origin) / 3);
	const levels: Record<string, readonly [number, number]> = {
		0: [origin, 1],
		1: [origin + step, 0.92],
		2: [origin + 2 * step, 0.84],
		3: [origin + 3 * step, 0.76],
		sunken: [
			clamp(
				light ? origin - Math.max(0.008, interval * 0.5) : canvas.oklch.l - interval,
				0.04,
				cap
			),
			1
		]
	};
	levels.overlay = levels[2]!;
	const result = Object.create(null) as Record<
		0 | 1 | 2 | 3 | 'sunken' | 'overlay',
		ResolvedSurface
	>;
	for (const bundle of themeSurfaceBundles) {
		const [l, chroma] = levels[String(bundle)]!;
		const background = resolveColor({ l, c: neutral.oklch.c * chroma, h: neutral.oklch.h });
		const textRatio = source.contrast === 'more' ? 7 : 4.5,
			boundaryRatio = source.contrast === 'more' ? 4.5 : 3;
		const foreground = contrasted(
			{ l: light ? 0.2 : 0.92, c: neutral.oklch.c, h: neutral.oklch.h },
			[background],
			textRatio,
			source,
			warnings,
			`surfaces.${bundle}.foreground`
		);
		const foregroundMuted = contrasted(
			{ l: light ? 0.42 : 0.7, c: neutral.oklch.c, h: neutral.oklch.h },
			[background],
			textRatio,
			source,
			warnings,
			`surfaces.${bundle}.foregroundMuted`
		);
		const direction = light ? -1 : 1;
		const border = contrasted(
			{ l: l + 0.14 * direction, c: neutral.oklch.c, h: neutral.oklch.h },
			[background],
			boundaryRatio,
			source,
			warnings,
			`surfaces.${bundle}.border`
		);
		const borderStrong = contrasted(
			{ l: l + 0.25 * direction, c: neutral.oklch.c, h: neutral.oklch.h },
			[background],
			boundaryRatio,
			source,
			warnings,
			`surfaces.${bundle}.borderStrong`
		);
		result[bundle] = freezeThemeValue({
			background,
			foreground,
			foregroundMuted,
			border,
			borderStrong,
			shadow: surfaceShadow(bundle, source.depth, source.appearance)
		});
	}
	return result;
}
function surfaceShadow(
	bundle: (typeof themeSurfaceBundles)[number],
	depth: ResolvedThemeSource['depth'],
	appearance: ThemeAppearance
): string {
	if (depth !== 'elevated' || bundle === 0) return 'none';
	if (appearance === 'dark') {
		if (bundle === 'sunken')
			return 'inset 0 0 0 1px rgb(255 255 255 / 0.14), inset 0 2px 4px rgb(0 0 0 / 0.42)';
		if (bundle === 1)
			return '0 0 0 1px rgb(255 255 255 / 0.14), 0 2px 6px rgb(255 255 255 / 0.10), 0 1px 2px rgb(0 0 0 / 0.35)';
		if (bundle === 2 || bundle === 'overlay')
			return '0 0 0 1px rgb(255 255 255 / 0.22), 0 5px 16px rgb(255 255 255 / 0.14), 0 2px 4px rgb(0 0 0 / 0.38)';
		return '0 0 0 2px rgb(255 255 255 / 0.28), 0 12px 32px rgb(255 255 255 / 0.18), 0 4px 10px rgb(0 0 0 / 0.42)';
	}
	const value =
		bundle === 'sunken'
			? 'inset 0 1px 2px rgb(0 0 0 / 0.08)'
			: bundle === 1
				? '0 1px 2px rgb(0 0 0 / 0.12), 0 1px 4px rgb(0 0 0 / 0.08)'
				: bundle === 2
					? '0 4px 12px rgb(0 0 0 / 0.16), 0 1px 3px rgb(0 0 0 / 0.10)'
					: '0 12px 32px rgb(0 0 0 / 0.22), 0 3px 8px rgb(0 0 0 / 0.12)';
	return value;
}
/** Derives the neutral, accent, and harmonized status hue families. */
export function toneFamilies(
	key: ResolvedColor,
	neutral: ResolvedColor,
	accentChroma: number,
	temperament: ThemeTemperament
): Record<ThemeTone, { h: number; c: number }> {
	// Status intensity follows the temperament. A fixed 0.1 floor previously made nearly every
	// preset's statuses equally saturated even when its accent and neutral relationships differed.
	const statusChroma = Math.min(Math.max(accentChroma * 0.9, 0.04), temperament.accentChromaCap);
	return {
		neutral: { h: neutral.oklch.h, c: neutral.oklch.c },
		accent: { h: key.oklch.h, c: accentChroma },
		info: { h: harmonizeHue(250, key.oklch.h, temperament.statusHarmonization), c: statusChroma },
		success: {
			h: harmonizeHue(145, key.oklch.h, temperament.statusHarmonization),
			c: statusChroma
		},
		warning: { h: harmonizeHue(85, key.oklch.h, temperament.statusHarmonization), c: statusChroma },
		danger: { h: harmonizeHue(25, key.oklch.h, temperament.statusHarmonization), c: statusChroma }
	};
}
/** Derives every interactive role for one semantic tone family. */
export function createTone(
	family: { h: number; c: number },
	keyLightness: number,
	surfaces: Record<string, ResolvedSurface>,
	source: ResolvedThemeSource,
	warnings: ThemeWarning[],
	path: string
): ResolvedTone {
	const surfaceList = themeSurfaceBundles.map((bundle) => surfaces[bundle]!.background),
		sl = surfaces[0]!.background.oklch.l;
	const d = source.appearance === 'light' ? -1 : 1,
		i = source.temperament.surfaceInterval,
		s = source.temperament.stateInterval;
	const role = (offset: number, chroma: number) =>
		resolveColor({ l: clamp(sl + d * offset, 0.001, 0.999), c: family.c * chroma, h: family.h });
	const subtle = role(i, 0.35),
		subtleHover = role(i + s, 0.35),
		subtleActive = role(i + 2 * s, 0.35),
		surface = role(2 * i, 0.55);
	const boundaryRatio = source.contrast === 'more' ? 4.5 : 3,
		textRatio = source.contrast === 'more' ? 7 : 4.5;
	const border = contrasted(
		{ l: sl + d * Math.max(0.18, 6 * i), c: family.c * 0.8, h: family.h },
		[...surfaceList, subtle],
		boundaryRatio,
		source,
		warnings,
		`${path}.border`
	);
	const text = contrasted(
		{ l: source.appearance === 'light' ? 0.38 : 0.78, c: family.c, h: family.h },
		[...surfaceList, subtle, surface],
		textRatio,
		source,
		warnings,
		`${path}.text`
	);
	const baseL = clamp(
		keyLightness,
		source.appearance === 'light' ? 0.35 : 0.42,
		source.appearance === 'light' ? 0.68 : 0.78
	);
	const solidPair = resolveSolid(
		{ l: baseL, c: family.c, h: family.h },
		undefined,
		source.appearance
	);
	// Move states away from the selected on-solid foreground. Appearance alone is insufficient:
	// light accents may use black text and dark accents may use white, which previously drove every
	// dark state into the same contrast boundary and erased the temperament's state interval.
	const solidDirection = solidPair.onSolid.oklch.l > 0.5 ? -1 : 1;
	const solidHover = resolveSolid(
		{
			l: clamp(solidPair.solid.oklch.l + solidDirection * s, 0.001, 0.999),
			c: family.c,
			h: family.h
		},
		solidPair.onSolid,
		source.appearance
	).solid;
	const solidActive = resolveSolid(
		{
			l: clamp(solidPair.solid.oklch.l + solidDirection * 2 * s, 0.001, 0.999),
			c: family.c,
			h: family.h
		},
		solidPair.onSolid,
		source.appearance
	).solid;
	const focus = contrasted(
		{ l: text.oklch.l, c: family.c, h: family.h },
		surfaceList,
		boundaryRatio,
		source,
		warnings,
		`${path}.focus`
	);
	return freezeThemeValue({
		subtle,
		subtleHover,
		subtleActive,
		surface,
		border,
		text,
		solid: solidPair.solid,
		solidHover,
		solidActive,
		onSolid: solidPair.onSolid,
		focus
	});
}
function resolveSolid(
	requested: { l: number; c: number; h: number },
	forcedForeground: ResolvedColor | undefined,
	appearance: ThemeAppearance
): { solid: ResolvedColor; onSolid: ResolvedColor } {
	const white = resolveColor({ l: 0.98, c: 0, h: 0 }),
		black = resolveColor({ l: 0.12, c: 0, h: 0 });
	let best: { solid: ResolvedColor; onSolid: ResolvedColor; distance: number } | undefined;
	for (const candidate of orderedLightnessCandidates(requested.l)) {
		if (best && candidate.distance > best.distance) break;
		const solid = resolveColor({ ...requested, l: candidate.lightness });
		const onSolid =
			forcedForeground ?? (contrast(solid, white) >= contrast(solid, black) ? white : black);
		if (contrast(solid, onSolid) < 4.5) continue;
		if (
			!best ||
			candidate.distance < best.distance ||
			(candidate.distance === best.distance &&
				(appearance === 'light'
					? solid.oklch.l < best.solid.oklch.l
					: solid.oklch.l > best.solid.oklch.l))
		)
			best = { solid, onSolid, distance: candidate.distance };
	}
	return best ?? { solid: resolveColor(requested), onSolid: forcedForeground ?? white };
}
function contrast(a: ResolvedColor, b: ResolvedColor): number {
	return contrastRatio(a, b);
}
function contrasted(
	requested: { l: number; c: number; h: number },
	backgrounds: readonly ResolvedColor[],
	ratio: number,
	source: ResolvedThemeSource,
	warnings: ThemeWarning[],
	path: string
): ResolvedColor {
	const result = ensureColorContrast(requested, backgrounds, ratio, source.appearance);
	if (result.maximized)
		warnings.push(
			Object.freeze({
				code: 'contrast-maximized',
				path,
				message: `${path} used maximum attainable contrast`
			})
		);
	return result.color;
}

/** Builds the complete semantic and structural token record. */
export function createThemeTokens(
	canvas: ResolvedColor,
	surfaces: Record<string, ResolvedSurface>,
	tones: Record<ThemeTone, ResolvedTone>,
	source: ResolvedThemeSource,
	warnings: ThemeWarning[]
): Record<ThemeTokenName, string> {
	const tokens = Object.create(null) as Record<ThemeTokenName, string>;
	for (const bundle of themeSurfaceBundles) {
		const surface = surfaces[bundle]!;
		const prefix = `surface-${bundle}-`;
		tokens[`${prefix}background` as ThemeTokenName] = surface.background.css;
		tokens[`${prefix}foreground` as ThemeTokenName] = surface.foreground.css;
		tokens[`${prefix}foreground-muted` as ThemeTokenName] = surface.foregroundMuted.css;
		tokens[`${prefix}border` as ThemeTokenName] = surface.border.css;
		tokens[`${prefix}border-strong` as ThemeTokenName] = surface.borderStrong.css;
		tokens[`${prefix}shadow` as ThemeTokenName] = surface.shadow;
	}
	for (const [name, value] of [
		['background', surfaces[0]!.background.css],
		['foreground', surfaces[0]!.foreground.css],
		['foreground-muted', surfaces[0]!.foregroundMuted.css],
		['border', surfaces[0]!.border.css],
		['border-strong', surfaces[0]!.borderStrong.css],
		['shadow', surfaces[0]!.shadow]
	] as const)
		tokens[`surface-${name}` as ThemeTokenName] = value;
	tokens.canvas = canvas.css;
	tokens['on-canvas'] = surfaces[0]!.foreground.css;
	tokens['on-canvas-muted'] = surfaces[0]!.foregroundMuted.css;
	const toneValues = {
		subtle: 'subtle',
		'subtle-hover': 'subtleHover',
		'subtle-active': 'subtleActive',
		surface: 'surface',
		border: 'border',
		text: 'text',
		solid: 'solid',
		'solid-hover': 'solidHover',
		'solid-active': 'solidActive',
		'on-solid': 'onSolid',
		focus: 'focus'
	} as const;
	for (const tone of themeTones) {
		const value = tones[tone];
		for (const role of themeToneRoles)
			tokens[`${tone}-${role}` as ThemeTokenName] = value[toneValues[role]].css;
	}
	const disabledBackground = tones.neutral.subtle;
	const textRatio = 3;
	const disabledForeground = contrasted(
		surfaces[0]!.foregroundMuted.oklch,
		[disabledBackground],
		textRatio,
		source,
		warnings,
		'tokens.disabled-foreground'
	);
	const disabledBorder = contrasted(
		tones.neutral.border.oklch,
		[disabledBackground, ...themeSurfaceBundles.map((bundle) => surfaces[bundle]!.background)],
		textRatio,
		source,
		warnings,
		'tokens.disabled-border'
	);
	tokens['disabled-background'] = disabledBackground.css;
	tokens['disabled-foreground'] = disabledForeground.css;
	tokens['disabled-border'] = disabledBorder.css;
	structuralTokens(tokens, source);
	return tokens;
}
function clamp(value: number, low: number, high: number): number {
	return Math.min(high, Math.max(low, value));
}
