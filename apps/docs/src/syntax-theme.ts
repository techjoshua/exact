import {
	createThemeDeriver,
	type ResolvedColor,
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

/** Derives a vivid syntax palette without changing the surrounding theme's temperament. */
export const vividSyntaxTheme = createThemeDeriver<{}, SyntaxPalette>({
	id: '@exactjs/docs/vivid-syntax',
	version: 1,
	derive(theme) {
		const surface = inverseNeutral(theme, 0.12);
		return {
			surface: theme.toCss(surface),
			surfaceRaised: theme.toCss(inverseNeutral(theme, 0.16)),
			text: theme.toCss(inverseNeutral(theme, 0.9)),
			muted: theme.toCss(inverseNeutral(theme, 0.67)),
			keyword: vivid(theme, surface, 'accent'),
			type: vivid(theme, surface, 'warning'),
			function: vivid(theme, surface, 'info'),
			string: vivid(theme, surface, 'success'),
			number: vivid(theme, surface, 'danger'),
			tag: vivid(theme, surface, 'danger'),
			property: vivid(theme, surface, 'info'),
			command: vivid(theme, surface, 'accent'),
			bracket: vivid(theme, surface, 'warning'),
			comment: theme.toCss(inverseNeutral(theme, 0.67)),
			operator: theme.toCss(inverseNeutral(theme, 0.9)),
			invalid: vivid(theme, surface, 'danger')
		};
	}
});

function vivid(theme: ThemeDerivationContext, background: ResolvedColor, tone: ThemeTone): string {
	const source = theme.tones[tone].solidActive,
		// Syntax is a dense identity channel, so it needs a chroma floor beyond ordinary semantic
		// prose. A zero-chroma temperament stays achromatic instead of acquiring arbitrary hues.
		chroma = source.oklch.c === 0 ? 0 : Math.min(0.2, Math.max(0.14, source.oklch.c * 1.7)),
		candidate = {
			colorSpace: 'oklch' as const,
			components: [0.78, chroma, source.oklch.h] as const
		};
	return theme.toCss(theme.ensureContrast(candidate, [background], 4.5));
}

function inverseNeutral(theme: ThemeDerivationContext, lightness: number) {
	return theme.ensureContrast(
		{
			colorSpace: 'oklch',
			components: [lightness, theme.neutral.oklch.c, theme.neutral.oklch.h]
		},
		[lightness < 0.5 ? '#fff' : '#000'],
		1
	);
}
