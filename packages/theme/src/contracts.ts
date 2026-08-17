/** Resolved light or dark presentation. */
export type ThemeAppearance = 'light' | 'dark';
/** Resolved standard or increased contrast. */
export type ThemeContrast = 'standard' | 'more';
/** Semantic color families shared by controls and exterior derivations. */
export type ThemeTone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger';
/** Curated tonic names supported alongside arbitrary colors by `theme:tonic`. */
export type BuiltInThemeKey = 'teal' | 'blue' | 'violet' | 'amber' | 'rose' | 'green';
/** Named surface depth in one generated theme. */
export type ThemeSurfaceBundle = 0 | 1 | 2 | 3 | 'sunken' | 'overlay';

/** Canonical opaque OKLCH color. */
export type OklchColor = Readonly<{ l: number; c: number; h: number; alpha: 1 }>;
/** Canonical color with an inspection fallback. */
export type ResolvedColor = Readonly<{
	oklch: OklchColor;
	srgb: readonly [number, number, number];
	css: string;
}>;
/** One complete semantic surface palette. */
export type ResolvedSurface = Readonly<{
	background: ResolvedColor;
	foreground: ResolvedColor;
	foregroundMuted: ResolvedColor;
	border: ResolvedColor;
	borderStrong: ResolvedColor;
	shadow: string;
}>;
/** Interactive and content roles for one semantic tone. */
export type ResolvedTone = Readonly<{
	subtle: ResolvedColor;
	subtleHover: ResolvedColor;
	subtleActive: ResolvedColor;
	surface: ResolvedColor;
	border: ResolvedColor;
	text: ResolvedColor;
	solid: ResolvedColor;
	solidHover: ResolvedColor;
	solidActive: ResolvedColor;
	onSolid: ResolvedColor;
	focus: ResolvedColor;
}>;
/** Non-fatal deterministic resolution diagnostic. */
export type ThemeWarning = Readonly<{
	code: 'contrast-maximized' | 'source-gamut-mapped';
	path: string;
	message: string;
}>;

/** Context-free CSS color or Design Tokens color value. */
export type ThemeColor =
	| string
	| Readonly<{
			colorSpace: 'srgb' | 'display-p3' | 'oklab' | 'oklch';
			components: readonly [number | 'none', number | 'none', number | 'none'];
			alpha?: number;
	  }>;

/** Data-only color relationship algorithm. */
export type ThemeTemperament = Readonly<{
	id: string;
	version: number;
	accentChromaMultiplier: number;
	accentChromaCap: number;
	neutralChromaCap: number;
	surfaceInterval: number;
	stateInterval: number;
	statusHarmonization: number;
}>;

/** Complete portable typography input. */
export type ThemeTypography = Readonly<{
	body: string;
	display: string;
	code: string;
	baseSizeRem: number;
	scaleRatio: number;
	bodyLineHeight: number;
	headingLineHeight: number;
}>;
/** Validated typography with a stable preset identity. */
export type ResolvedThemeTypography = ThemeTypography &
	Readonly<{ id: 'system' | 'humanist' | 'geometric' | 'editorial' | 'monospace' | 'custom' }>;

/** Primitive source fields accepted by a theme scope or the pure resolver. */
export type ThemeSource = Readonly<{
	keyColor?: ThemeColor;
	neutralColor?: 'auto' | ThemeColor;
	canvasColor?: 'auto' | ThemeColor;
	temperament?: BuiltInTemperament | ThemeTemperament;
	appearance?: 'inherit' | 'system' | ThemeAppearance;
	density?: 'inherit' | 'compact' | 'comfortable' | 'spacious';
	shape?: 'inherit' | 'square' | 'soft' | 'round' | 'pill';
	depth?: 'inherit' | 'flat' | 'bordered' | 'elevated';
	typography?: 'inherit' | TypographyPreset | ThemeTypography;
	contrast?: 'inherit' | 'system' | ThemeContrast;
	motion?: 'inherit' | 'system' | 'full' | 'reduced';
}>;
/** Built-in color relationship algorithms. */
export type BuiltInTemperament =
	| 'balanced'
	| 'restrained'
	| 'expressive'
	| 'dramatic'
	| 'soft'
	| 'stark'
	| 'monochrome';
/** Bundled system-safe typography choices. */
export type TypographyPreset = 'system' | 'humanist' | 'geometric' | 'editorial' | 'monospace';

/** Fully selected and validated theme source. */
export type ResolvedThemeSource = Readonly<{
	keyColor: ResolvedColor;
	neutralColor: 'auto' | ResolvedColor;
	canvasColor: 'auto' | ResolvedColor;
	temperament: ThemeTemperament;
	appearance: ThemeAppearance;
	density: 'compact' | 'comfortable' | 'spacious';
	shape: 'square' | 'soft' | 'round' | 'pill';
	depth: 'flat' | 'bordered' | 'elevated';
	typography: ResolvedThemeTypography;
	contrast: ThemeContrast;
	motion: 'full' | 'reduced';
}>;
/** Immutable, complete output of theme resolution. */
export type ResolvedTheme = Readonly<{
	contract: 'exact-theme/1';
	fingerprint: string;
	source: ResolvedThemeSource;
	key: ResolvedColor;
	neutral: ResolvedColor;
	surfaces: Readonly<Record<ThemeSurfaceBundle, ResolvedSurface>>;
	tones: Readonly<Record<ThemeTone, ResolvedTone>>;
	tokens: Readonly<Record<ThemeTokenName, string>>;
	warnings: readonly ThemeWarning[];
}>;
/** Explicit system preferences supplied to pure resolution. */
export type ThemeSystemPreferences = Readonly<{
	appearance: ThemeAppearance;
	contrast: ThemeContrast;
	motion: 'full' | 'reduced';
}>;
/** Complete pure theme resolution request. */
export type ThemeResolutionInput = Readonly<{
	parent?: ResolvedTheme;
	source?: ThemeSource;
	environment: ThemeSystemPreferences;
}>;

type SurfaceBundleName = '0' | '1' | '2' | '3' | 'sunken' | 'overlay';
type ToneName = ThemeTone;
/** Public color-token names in exact-theme/1. */
export type ThemeColorTokenName =
	| `surface-${SurfaceBundleName}-${'background' | 'foreground' | 'foreground-muted' | 'border' | 'border-strong'}`
	| `surface-${'background' | 'foreground' | 'foreground-muted' | 'border' | 'border-strong'}`
	| 'canvas'
	| 'on-canvas'
	| 'on-canvas-muted'
	| 'disabled-background'
	| 'disabled-foreground'
	| 'disabled-border'
	| `${ToneName}-${'subtle' | 'subtle-hover' | 'subtle-active' | 'surface' | 'border' | 'text' | 'solid' | 'solid-hover' | 'solid-active' | 'on-solid' | 'focus'}`;
/** Public dimension-token names in exact-theme/1. */
export type ThemeDimensionTokenName =
	| `font-size-${'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'}`
	| `letter-spacing-${'tight' | 'normal' | 'wide'}`
	| `space-${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
	| `control-height-${'sm' | 'md' | 'lg'}`
	| `control-padding-inline-${'sm' | 'md' | 'lg'}`
	| 'control-gap'
	| `radius-${'sm' | 'md' | 'lg' | 'pill'}`
	| 'border-width'
	| 'focus-width'
	| 'focus-offset';
/** Public unitless numeric-token names. */
export type ThemeNumberTokenName =
	| `line-height-${'tight' | 'body' | 'loose'}`
	| `font-weight-${'regular' | 'medium' | 'strong'}`;
/** Public font-family token names. */
export type ThemeFontTokenName = `font-${'body' | 'display' | 'code'}`;
/** Public shadow-token names. */
export type ThemeShadowTokenName =
	| `surface-${SurfaceBundleName}-shadow`
	| 'surface-shadow'
	| `shadow-${'sm' | 'md' | 'lg'}`;
/** Public duration-token names. */
export type ThemeDurationTokenName = `duration-${'fast' | 'base' | 'slow'}`;
/** Public easing-token names. */
export type ThemeEasingTokenName = `easing-${'standard' | 'emphasized'}`;
/** Every public CSS token name in exact-theme/1. */
export type ThemeTokenName =
	| ThemeColorTokenName
	| ThemeDimensionTokenName
	| ThemeNumberTokenName
	| ThemeFontTokenName
	| ThemeShadowTokenName
	| ThemeDurationTokenName
	| ThemeEasingTokenName;
/** CSS spelling of a public token. */
export type ThemeCustomProperty = `--exact-theme-${ThemeTokenName}`;
/** Complete custom-property publication map. */
export type ThemeVariableMap = Readonly<Record<ThemeCustomProperty, string>>;

/** Typed CSS dimension used by token overrides. */
export type ThemeDimension = Readonly<{ value: number; unit: 'px' | 'rem' | 'em' }>;
/** Typed duration used by token overrides. */
export type ThemeDuration = Readonly<{ milliseconds: number }>;
/** Typed cubic-bezier easing used by token overrides. */
export type ThemeEasing = Readonly<{
	kind: 'cubic-bezier';
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}>;
/** Typed, bounded shadow layer list used by token overrides. */
export type ThemeShadow =
	| 'none'
	| readonly Readonly<{
			inset?: boolean;
			x: ThemeDimension;
			y: ThemeDimension;
			blur: ThemeDimension;
			spread?: ThemeDimension;
			color: ThemeColor;
	  }>[];
/** Runtime kind of a public token. */
export type ThemeTokenKind =
	| 'color'
	| 'dimension'
	| 'number'
	| 'font-family'
	| 'shadow'
	| 'duration'
	| 'easing';
/** Valid value for one named token override. */
export type ThemeTokenValue<N extends ThemeTokenName> = N extends ThemeColorTokenName
	? ThemeColor
	: N extends ThemeDimensionTokenName
		? ThemeDimension
		: N extends ThemeNumberTokenName
			? number
			: N extends ThemeFontTokenName
				? string
				: N extends ThemeShadowTokenName
					? ThemeShadow
					: N extends ThemeDurationTokenName
						? ThemeDuration
						: ThemeEasing;
/** Type-safe sparse override of public tokens. */
export type ThemeOverrideTokens = { readonly [N in ThemeTokenName]?: ThemeTokenValue<N> };
/** Runtime metadata for one public theme token. */
export type ThemeTokenDescriptor = Readonly<{
	cssName: ThemeCustomProperty;
	kind: ThemeTokenKind;
	description: string;
	minimum?: number;
	maximum?: number;
}>;
