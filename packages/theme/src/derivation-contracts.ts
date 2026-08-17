import type {
	ResolvedColor,
	ResolvedSurface,
	ResolvedTone,
	ThemeColor,
	ThemeContrast,
	ThemeSurfaceBundle,
	ThemeTone
} from './contracts.js';

/** Color helpers exposed to a deterministic exterior deriver. */
export type ThemeDerivationContext = Readonly<{
	contract: 'exact-theme/1';
	sourceFingerprint: string;
	appearance: 'light' | 'dark';
	contrast: ThemeContrast;
	key: ResolvedColor;
	neutral: ResolvedColor;
	surfaces: Readonly<Record<ThemeSurfaceBundle, ResolvedSurface>>;
	tones: Readonly<Record<ThemeTone, ResolvedTone>>;
	tonalPalette(input: ResolvedColor | ThemeTone): TonalPalette;
	harmonize(color: ThemeColor | ResolvedColor, amount: number): ResolvedColor;
	ensureContrast(
		foreground: ThemeColor | ResolvedColor,
		backgrounds: readonly (ThemeColor | ResolvedColor)[],
		ratio: number
	): ResolvedColor;
	toCss(color: ThemeColor | ResolvedColor): string;
}>;
/** Fixed-hue/chroma palette that resolves requested tone lightness. */
export type TonalPalette = Readonly<{
	hue: number;
	chroma: number;
	at(tone: number): ResolvedColor;
}>;
/** Versioned synchronous derivation algorithm owned by an exterior library. */
export type ThemeDeriver<Input, Output> = Readonly<{
	id: string;
	version: number;
	derive(context: ThemeDerivationContext, input: Readonly<Input>): Readonly<Output>;
}>;
/** Built-in deterministic chart-color request. */
export type DataColorRequest =
	| Readonly<{
			kind: 'categorical';
			count: number;
			surface?: ThemeSurfaceBundle;
			emphasis?: 'balanced' | 'accent-first';
	  }>
	| Readonly<{
			kind: 'sequential';
			steps: number;
			source?: ThemeTone | ThemeColor;
			direction?: 'low-to-high' | 'high-to-low';
			surface?: ThemeSurfaceBundle;
	  }>
	| Readonly<{
			kind: 'diverging';
			steps: 3 | 5 | 7 | 9 | 11;
			negative?: ThemeTone | ThemeColor;
			positive?: ThemeTone | ThemeColor;
			midpoint?: 'surface' | ThemeColor;
			surface?: ThemeSurfaceBundle;
	  }>;
/** Accessible colors, strokes, patterns, and diagnostics for a data-color request. */
export type DataColorResult = Readonly<{
	colors: readonly string[];
	foregrounds: readonly string[];
	strokes: readonly string[];
	recommendedPatterns: readonly ('solid' | 'diagonal' | 'crosshatch' | 'dots')[];
	warnings: readonly Readonly<{ code: 'categorical-distance'; message: string }>[];
}>;
