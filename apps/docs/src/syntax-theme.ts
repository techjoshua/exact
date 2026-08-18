import {
	createThemeDeriver,
	deriveTheme,
	type ResolvedColor,
	type ResolvedTheme,
	type ThemeDerivationContext,
	type ThemeTone
} from '@exactjs/theme';

/** Vivid, contrast-safe colors used by one syntax-highlighted code surface. */
export type SyntaxPalette = Readonly<{
	surface: string;
	surfaceRaised: string;
	text: string;
	muted: string;
	keyword: string;
	type: string;
	function: string;
	string: string;
	number: string;
	tag: string;
	property: string;
	command: string;
	bracket: string;
	comment: string;
	operator: string;
	invalid: string;
}>;

/** Selects whether syntax follows or deliberately inverts the surrounding appearance. */
export type SyntaxPaletteRequest = Readonly<{
	appearance: 'light' | 'dark' | 'follow' | 'inverse';
}>;

const paletteCache = new WeakMap<
	ResolvedTheme,
	Partial<Record<SyntaxPaletteRequest['appearance'], SyntaxPalette>>
>();

/** Derives a vivid syntax palette without changing the surrounding theme's temperament. */
export const vividSyntaxTheme = createThemeDeriver<SyntaxPaletteRequest, SyntaxPalette>({
	id: '@exactjs/docs/vivid-syntax',
	version: 2,
	derive(theme, request) {
		const appearance =
			request.appearance === 'light' || request.appearance === 'dark'
				? request.appearance
				: request.appearance === 'inverse'
					? theme.appearance === 'light'
						? 'dark'
						: 'light'
					: theme.appearance;
		const dark = appearance === 'dark',
			surface = neutralAt(theme, dark ? 0.12 : 0.95),
			text = theme.toCss(neutralAt(theme, dark ? 0.9 : 0.18)),
			muted = theme.toCss(neutralAt(theme, dark ? 0.67 : 0.43)),
			accent = vivid(theme, surface, 'accent', appearance),
			warning = vivid(theme, surface, 'warning', appearance),
			info = vivid(theme, surface, 'info', appearance),
			success = vivid(theme, surface, 'success', appearance),
			danger = vivid(theme, surface, 'danger', appearance);
		return {
			surface: theme.toCss(surface),
			surfaceRaised: theme.toCss(neutralAt(theme, dark ? 0.16 : 0.98)),
			text,
			muted,
			keyword: accent,
			type: warning,
			function: info,
			string: success,
			number: danger,
			tag: danger,
			property: info,
			command: accent,
			bracket: warning,
			comment: muted,
			operator: text,
			invalid: danger
		};
	}
});

/** Reuses one immutable syntax derivation across code blocks sharing the same resolved theme. */
export function deriveSyntaxPalette(
	theme: ResolvedTheme,
	appearance: SyntaxPaletteRequest['appearance']
): Readonly<SyntaxPalette> {
	let palettes = paletteCache.get(theme);
	if (!palettes) {
		palettes = {};
		paletteCache.set(theme, palettes);
	}
	return (palettes[appearance] ??= deriveTheme(theme, vividSyntaxTheme, { appearance }));
}

function vivid(
	theme: ThemeDerivationContext,
	background: ResolvedColor,
	tone: ThemeTone,
	appearance: 'light' | 'dark'
): string {
	const source = theme.tones[tone].solidActive;
	if (source.oklch.c === 0)
		return theme.toCss(neutralAt(theme, appearance === 'dark' ? 0.78 : 0.35));
	let best: ResolvedColor | undefined;
	const [start, end] = appearance === 'dark' ? [55, 90] : [25, 55];
	for (let step = start; step <= end; step++) {
		const candidate = colorAt(theme, step / 100, 0.4, source.oklch.h);
		if (contrast(candidate, background) < 4.5) continue;
		// Different hues reach their sRGB gamut cusp at different lightness values. Searching the
		// accessible interval avoids forcing every light token into teal's low-chroma dark band.
		if (!best || candidate.oklch.c > best.oklch.c) best = candidate;
	}
	return theme.toCss(best ?? theme.ensureContrast(source, [background], 4.5));
}

function neutralAt(theme: ThemeDerivationContext, lightness: number): ResolvedColor {
	return colorAt(theme, lightness, theme.neutral.oklch.c, theme.neutral.oklch.h);
}

function colorAt(
	theme: ThemeDerivationContext,
	lightness: number,
	chroma: number,
	hue: number
): ResolvedColor {
	return theme.ensureContrast(
		{ colorSpace: 'oklch', components: [lightness, chroma, hue] },
		[lightness < 0.5 ? '#fff' : '#000'],
		1
	);
}

function contrast(a: ResolvedColor, b: ResolvedColor): number {
	const luminance = (color: ResolvedColor) => {
		const channels = color.srgb.map((channel) => {
			const value = channel / 255;
			return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
	};
	const x = luminance(a),
		y = luminance(b);
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
