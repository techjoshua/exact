# Semantic generative theming

## Status

**Implemented.** This document is the normative design record for the shipped `@exactjs/theme`
package and contract `exact-theme/1`. The current operational reference is
[`docs/theme.md`](../theme.md); this record retains the complete formulas, token names, algorithms,
acceptance matrix, and decisions against which the implementation is tested.

Browser acceptance is being added incrementally. The current automated gate establishes the
Chromium baseline described in `docs/theme.md`; it does not yet certify the entire cross-engine,
forced-colors, zoom, text-spacing, SSR, and hydration matrix below.

Normative terms are intentional: **must** identifies a conformance requirement, **should** permits
departure only with a documented reason that preserves the stated invariant, and **may** describes
optional behavior. Examples are illustrative unless a surrounding requirement makes their
behavior normative.

The proposal uses these terms consistently:

- **theme source**: the small authored set of choices from which a theme is resolved;
- **temperament**: a named, versioned algorithm that controls the relationships among generated
  colors without selecting element semantics;
- **resolved theme**: one immutable, validated set of primitive scales and semantic tokens;
- **theme scope**: a DOM and component-context boundary that publishes one resolved theme;
- **surface context**: the independently nested semantic depth within a theme scope;
- **recipe**: static CSS owned by an enhancement role, such as `theme:action`; and
- **deriver**: a pure extension that produces specialized data, such as chart colors, from a
  resolved theme.

## Decision summary

1. `@exactjs/theme` is an optional component library implemented entirely through enhancements, with a typed
   `ThemeContext`, pure resolver and derivation APIs, a static recipe stylesheet, and a finite
   `theme:*` enhancement namespace.
2. A theme source combines a key color with a temperament and independent appearance, density,
   shape, depth, typography, contrast, and motion axes. Every field has an inherited or documented
   root default.
3. The resolver converts colors to OKLCH, generates opaque tonal relationships, validates gamut
   and contrast, and returns one immutable `ResolvedTheme`. Temperaments change generation
   relationships; they do not silently select fonts, density, shape, or motion.
4. Static recipe CSS is loaded once. A theme scope publishes the exact custom properties defined
   by contract `exact-theme/1`; themed descendants reference those live properties rather than
   receiving copied colors.
5. A reactive source change resolves a complete replacement before DOM publication. One scope
   commit updates all descendants through the CSS cascade without remounting components or
   rerunning element recipes.
6. Nested `theme:scope` activations inherit omitted source fields and re-resolve when an inherited
   parent field changes. `createThemeOverride()` instead validates named token patches for an
   ordinary wrapper and does not claim that the result is a newly generated theme.
7. `theme:surface` tracks a finite surface context separately from theme selection. It binds a
   complete local foreground/background/border/shadow bundle, not only a background color.
8. The initial authoring vocabulary is `theme:surface`, `theme:action`, `theme:field`,
   `theme:text`, `theme:status`, `theme:separator`, and `theme:selection`, with the shared
   modifiers `theme:tone` and `theme:size` where allowed.
9. Native and ARIA state supplies disabled, invalid, selected, current, pressed, checked, hover,
   focus, and active information. Authors label visual intent rather than restating browser state.
10. Exterior libraries use `createThemeDeriver()` and `deriveTheme()` over an immutable derivation
    context. The built-in `deriveDataColors()` covers categorical, sequential, and diverging data.
    No extension reads computed CSS, mutates a theme, or registers global callbacks.

## Motivation

Component libraries commonly ship either fixed visual assumptions or a private token vocabulary.
Applications then override selectors, duplicate variables, or wrap every component in adapter CSS.
Those techniques couple the application to library internals and make light/dark changes, nested
themes, accessibility, and library upgrades expensive.

eXact enhancements already provide the missing semantic seam. A library can state that an
intrinsic is an action, surface, field, heading, status, or selection without replacing its native
HTML meaning. The consuming application can select the theme provider, and `_target` can contribute
the stable recipe class and data attributes to the actual semantic intrinsic.

The theme should also be generative. As a musical temperament establishes consistent interval
relationships around a tonic, a visual temperament establishes tonal, chromatic, and state
relationships around a key color. The same key color can therefore produce restrained,
expressive, soft, or stark palettes while retaining a common semantic output contract.

The result is an interoperability protocol:

```text
theme source -> temperament resolver -> exact-theme/1 variables
                                             |
component intent -> theme:* enhancement -> static recipe CSS
```

### Evidence baseline

The initial resolver should reuse established constraints and compare its output with established
systems rather than presenting preference as science:

- [Material Color Utilities](https://github.com/material-foundation/material-color-utilities)
  demonstrates deterministic dynamic schemes, tonal palettes, harmonization, gamut handling, and
  contrast adjustment from a small color input.
- [Radix Themes](https://www.radix-ui.com/themes/docs/components/theme) demonstrates a practical
  compact source vocabulary of appearance, accent, neutral, surface treatment, radius, and scale,
  while its [color roles](https://www.radix-ui.com/themes/docs/theme/color) separate backgrounds,
  interactive states, borders, solids, readable text, focus, and contrast.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) supplies normative accessibility constraints for
  contrast, focus, target size, reflow, and user text-spacing changes. It does not establish a
  universally attractive palette, spacing ratio, or shape.
- The [Design Tokens Community Group color
  format](https://www.w3.org/community/reports/design-tokens/CG-FINAL-color-20251028/) supplies the
  interoperable structured color input used by this proposal; `exact-theme/1` remains a semantic
  runtime contract rather than another general token-file format.

Resolver acceptance should compare representative generated interfaces, not swatches alone. A
coherent palette can still fail when text, controls, surfaces, data visualization, and interaction
states are composed in realistic density.

## Goals

- Generate a coherent, accessible theme from a small set of authored choices.
- Make every source field and element intent reactive without remounting or whole-tree component
  work.
- Permit nested themes and nested semantic surfaces with deterministic SSR and hydration.
- Give unrelated component libraries one finite, typed authoring vocabulary.
- Specify stable CSS custom-property names so low-level and non-eXact integrations can participate.
- Keep ordinary pseudo-classes, native states, forced colors, and user preferences under browser
  control.
- Make theme generation, validation, inspection, serialization, and specialized derivation pure
  and testable.
- Permit charts, editors, maps, diagrams, and other domain components to derive additional values
  without expanding the common UI token contract.
- Preserve meaningful authored HTML when the optional enhancement provider is absent.

## Non-goals

- Proving a universal mathematical definition of beauty.
- Replacing application layout, utility CSS, CSS modules, or ordinary authored styles.
- Styling unlabelled elements globally, except for the documented theme-scope inheritance and
  forced-colors rules.
- Inferring destructive intent, visual prominence, or surface meaning from element text.
- Making every possible component-specific token part of the portable contract.
- Guaranteeing that categorical data is distinguishable by color alone.
- Loading fonts, icons, images, textures, or remote assets.
- Letting a temperament silently choose density, typography, shape, depth, or motion.
- Requiring a JavaScript runtime merely to apply a statically serialized resolved theme.

## Package surface

The proposed package exports:

```ts
export {
  ThemeContext,
  ThemeSurfaceContext,
  ThemeResolutionError,
  resolveTheme,
  serializeThemeVariables,
  createThemeDeriver,
  deriveTheme,
  deriveDataColors,
  exactThemeContract
} from '@exactjs/theme';

export * as theme from '@exactjs/theme/enhancements'
  with { type: 'exact-enhancement' };

import '@exactjs/theme/styles.css';
```

Applications that use package-wide theme labels should configure the namespace once:

```ts
// exact.config.ts
export * as theme from '@exactjs/theme/enhancements' with { type: 'exact-enhancement', scope: 'package' };

export default defineConfig({});
```

`styles.css` contains the default root contract values, role recipes, surface aliasing, native
state selectors, forced-colors behavior, and reduced-motion behavior. It must contain no
application theme and perform no runtime style injection.

### Complete public data model

The package exports the following value types. All resolved objects and arrays are recursively
frozen. `ThemeWarning.code` is a finite package-owned diagnostic code; messages are explanatory and
are not protocol identity.

```ts
export type ThemeAppearance = 'light' | 'dark';
export type ThemeContrast = 'standard' | 'more';
export type ThemeTone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger';
export type ThemeSurfaceBundle = 0 | 1 | 2 | 3 | 'sunken' | 'overlay';

export type OklchColor = Readonly<{
	l: number; // 0..1
	c: number; // 0..0.4 after validation; gamut mapping may reduce it
	h: number; // 0..<360; achromatic colors canonicalize to 0
	alpha: 1;
}>;

export type ResolvedColor = Readonly<{
	oklch: OklchColor;
	srgb: readonly [number, number, number]; // rounded 8-bit channels, 0..255
	css: string; // canonical oklch() serialization
}>;

export type ResolvedSurface = Readonly<{
	background: ResolvedColor;
	foreground: ResolvedColor;
	foregroundMuted: ResolvedColor;
	border: ResolvedColor;
	borderStrong: ResolvedColor;
	shadow: string;
}>;

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

export type ThemeWarning = Readonly<{
	code: 'contrast-maximized' | 'source-gamut-mapped';
	path: string;
	message: string;
}>;

export declare class ThemeResolutionError extends Error {
	readonly code:
		| 'invalid-color'
		| 'invalid-source'
		| 'invalid-temperament'
		| 'invalid-typography'
		| 'invalid-override';
	readonly path: string;
}

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

export type ThemeSystemPreferences = Readonly<{
	appearance: ThemeAppearance;
	contrast: ThemeContrast;
	motion: 'full' | 'reduced';
}>;

export type ThemeResolutionInput = Readonly<{
	parent?: ResolvedTheme;
	source?: ThemeSource;
	environment: ThemeSystemPreferences;
}>;

export function resolveTheme(input: ThemeResolutionInput): ResolvedTheme;

export type ThemeCustomProperty = `--exact-theme-${ThemeTokenName}`;
export type ThemeVariableMap = Readonly<Record<ThemeCustomProperty, string>>;

export function serializeThemeVariables(theme: ResolvedTheme): ThemeVariableMap;
```

`resolveTheme()` and override validation throw `ThemeResolutionError` with the most specific source
path and retain no mutation. `serializeThemeVariables()` rejects an object whose contract is not
`exact-theme/1` with `TypeError`. Derivation helper range errors use native `RangeError`; malformed
deriver definitions use `TypeError`.

`serializeThemeVariables()` inserts keys in ascending code-point order and returns a frozen null-
prototype record. The renderer and SSR join entries as `name:value` declarations in that order.
Serialization never depends on object construction order, locale comparison, or the host's number
formatting.

The fingerprint is lowercase base64url SHA-256 of canonical UTF-8 JSON containing contract,
canonical resolved source fields, every temperament parameter, and environment-selected values.
Object keys use ascending Unicode code-point order, arrays retain order, numbers use the same fixed
rounding as token serialization, and JSON contains no insignificant whitespace. Tokens and
warnings are excluded because they are deterministic consequences checked separately. The package
owns one synchronous platform-independent SHA-256 implementation so `resolveTheme()` remains pure
and identical in SSR, tests, and browsers.

## Theme source contract

### Color input

Public color inputs accept a CSS color string or the Design Tokens Community Group color shape:

```ts
export type ThemeColor =
	| string
	| Readonly<{
			colorSpace: 'srgb' | 'display-p3' | 'oklab' | 'oklch';
			components: readonly [number | 'none', number | 'none', number | 'none'];
			alpha?: number;
	  }>;
```

The resolver must reject an unparseable color, an array other than exactly three components, a
non-finite numeric component, or an alpha outside `0..1`. A DTCG `none` component canonicalizes to
zero; hue later canonicalizes under the achromatic rule. Theme source colors must be opaque after
compositing. An input with alpha less than one is composited over the inherited canvas before
generation; a root source with alpha requires an explicit opaque `canvasColor`.

The serialized and inspected canonical representation is OKLCH plus an sRGB fallback. The package
must not depend on the current browser's color parser for resolution because SSR, tests, and the
browser must produce identical values.

### `theme:scope` options

`theme:scope` is the boolean activator. Its enhancement modifiers are `theme:tonic`,
`theme:temperament`, `theme:appearance`, `theme:density`, `theme:shape`, `theme:depth`,
`theme:typography`, `theme:contrast`, `theme:motion`, `theme:background`, and `theme:element`.
`theme:tonic` accepts `inherit`, the curated names `teal`, `blue`, `violet`, `amber`, `rose`, and
`green`, or any opaque `ThemeColor`; `theme:temperament` accepts `inherit` or any built-in
temperament. Arbitrary tonic colors use the ordinary enhancement prop path and require no compiler
behavior.

`theme:scope` is activated on a transparent `_` range and owns the selected real DOM wrapper,
defaulting to `div`. The wrapper publishes `data-exact-theme`, appearance and background data
attributes, and the serialized custom-property style attribute. The implementation is an ordinary
component-library enhancement and requires no compiler, DOM, SSR, hydration, or core-runtime
changes. The wrapper adds no display, position, margin, padding, border, or accessible role;
sectioning elements must be selected only when their native semantics are appropriate.
It establishes the resolved body font, base size, body line-height, and accent color so ordinary
native descendants inherit the scope's typography. Heading, display, and code recipes override
that baseline with their dedicated generated tokens.

Omitted values and explicit `inherit` values inherit. At a root without an ancestor theme, the defaults are:

| Field          | Root default           | Meaning                                                 |
| -------------- | ---------------------- | ------------------------------------------------------- |
| `keyColor`     | `oklch(0.54 0.09 185)` | eXact teal tonic                                        |
| `neutralColor` | `auto`                 | key-hued neutral under the temperament's chroma cap     |
| `canvasColor`  | `auto`                 | generated appearance canvas                             |
| `temperament`  | `balanced`             | moderate chroma, surface, and state intervals           |
| `appearance`   | `system`               | reactive `prefers-color-scheme`, light when unavailable |
| `density`      | `comfortable`          | medium spacing and control targets                      |
| `shape`        | `soft`                 | restrained rounded corners                              |
| `depth`        | `bordered`             | tonal surfaces plus boundaries, no required elevation   |
| `typography`   | `system`               | portable system body, display, and monospace stacks     |
| `contrast`     | `system`               | reactive `prefers-contrast`, otherwise standard         |
| `motion`       | `system`               | reactive `prefers-reduced-motion`, otherwise full       |
| `background`   | `canvas`               | paint the scope canvas; `theme:override` is transparent |

`inherit` at the root is equivalent to the corresponding root default. `system` is a live
environment choice, not a one-time mount sample. A change to `prefers-color-scheme`,
`prefers-contrast`, or `prefers-reduced-motion` must resolve and publish the affected scope again.

`ThemeTypography` accepts only complete stacks and scale inputs:

```ts
export type ThemeTypography = Readonly<{
	body: string;
	display: string;
	code: string;
	baseSizeRem: number; // 0.875..1.25
	scaleRatio: number; // 1.067..1.333
	bodyLineHeight: number; // 1.2..2
	headingLineHeight: number; // 1..1.5
}>;

export type ResolvedThemeTypography = Readonly<{
	id: 'system' | 'humanist' | 'geometric' | 'editorial' | 'monospace' | 'custom';
	body: string;
	display: string;
	code: string;
	baseSizeRem: number;
	scaleRatio: number;
	bodyLineHeight: number;
	headingLineHeight: number;
}>;
```

The resolver rejects values outside those closed ranges. It does not fetch the named fonts.

All five named presets ship in v1 and resolve to these exact stacks:

| Preset      | Body                                                                                    | Display                             | Code                                                                                          |
| ----------- | --------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `system`    | `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`   | same as body                        | `ui-monospace, "SFMono-Regular", Consolas, "Liberation Mâ€¦15492 tokens truncatedâ€¦ distance |
| `humanist`  | `Candara, "Segoe UI", Calibri, ui-sans-serif, system-ui, sans-serif`                    | same as body                        | system code stack                                                                             |
| `geometric` | `"Avenir Next", Avenir, Futura, "Century Gothic", ui-sans-serif, system-ui, sans-serif` | same as body                        | system code stack                                                                             |
| `editorial` | `Charter, "Bitstream Charter", "Sitka Text", Georgia, serif`                            | `Georgia, "Times New Roman", serif` | system code stack                                                                             |
| `monospace` | system code stack                                                                       | system code stack                   | system code stack                                                                             |

## Enhancement-only package boundary

The shipped feature is entirely an optional component library. The compiler sees the same imported
enhancement capabilities it sees for any other library; the DOM, SSR, hydration, reactive, core,
and compiler packages receive no theme-specific behavior. The public `@exactjs/theme/enhancements`
facade exposes `scope`, `surface`, `action`, `field`, `text`, `status`,
`separator`, and `selection`.

A scope is authored on a transparent range because it owns a wrapper:

```tsx
<_
	theme:scope
	theme:tonic="blue"
	theme:temperament="balanced"
	theme:appearance="system"
	theme:element="main"
>
	<Application />
</_>
```

The enhancement wrapper publishes all `exact-theme/1` variables and provides `ThemeContext`
and a reset `ThemeSurfaceContext`. A reactive source or media-query change computes a complete
replacement before publication. Nested scopes inherit omitted source fields. No descendant is
remounted merely because variables or derivation context changed.

`createThemeOverride()` accepts typed sparse `ThemeOverrideTokens` and returns a validated style
string for an ordinary wrapper. It publishes only named custom properties, does not create a
resolved theme, and does not change the context fingerprint or values seen by derivers.

## CSS custom-property contract

Every scope publishes all 164 public variables under `--exact-theme-`. The machine-readable
`exactThemeContract.tokens` record is authoritative for names, kinds, descriptions, and numeric
limits. The groups are:

- canvas, on-canvas, and muted canvas foregrounds;
- six surface bundles (`0`, `1`, `2`, `3`, `sunken`, and `overlay`) with background,
  foreground, muted foreground, border, strong border, and shadow;
- six tones (`neutral`, `accent`, `info`, `success`, `warning`, and `danger`) with
  subtle, hover, active, surface, border, text, solid, solid-hover, solid-active, on-solid, and
  focus roles;
- disabled background, foreground, and border;
- spacing, control height/padding/gap, radius, typography, line-height, weight, tracking, border,
  focus, shadow, duration, and easing tokens.

The checked-in stylesheet is generated from the resolver for the four system
appearance/contrast combinations. Each generated color declaration has an sRGB fallback followed
by canonical OKLCH. Static recipes consume variables and native or ARIA state; no runtime
stylesheet is injected.

## Resolver invariants

`resolveTheme()` is pure and requires explicit system preferences. It parses the documented
context-free CSS Color 4 subset and DTCG structured colors without using a browser parser,
composites translucent authored colors over an opaque canvas, converts to OKLCH, and gamut-maps
with 24 fixed chroma bisections. Output is recursively frozen and carries a SHA-256-derived,
base64url source fingerprint.

Built-in temperaments are named, versioned data. They control accent multiplier/cap, neutral cap,
surface interval, state interval, and status harmonization, while typography, density, shape,
depth, contrast, appearance, and motion remain independent. Text candidates target 4.5:1 in
standard contrast and 7:1 in increased contrast. Boundaries target 3:1 and 4.5:1 respectively.
Solid colors search the 1,001-value lightness grid nearest-first and stop after proving the closest
valid distance. They select the same deterministic readable on-solid pair as a complete exhaustive
scan; unattainable contrast still examines the whole grid to select the maximum.

Surface lightness advances by the temperament interval and caps before white or dark washout.
Status hues begin from fixed info, success, warning, and danger anchors and harmonize toward the key
hue by the temperament amount. Structural values are deterministic functions of their independent
source axes. Serialization uses stable token order and canonical finite decimal output.

## Element-role contract

Exactly one role activator labels an intrinsic. `theme:action` accepts `primary`,
`secondary`, or `quiet`; `theme:field` accepts `default`, `subtle`, or `bare`;
`theme:text` accepts `body`, `supporting`, `muted`, `heading`, `display`, or `code`;
`theme:status` requires `neutral`, `info`, `success`, `warning`, or `danger`;
`theme:separator` accepts `subtle` or `strong`; and `theme:selection` accepts `subtle` or
`strong`. Supported roles may also accept a semantic `tone` and control `size`.

`theme:surface` accepts `auto`, `base`, `raised`, `floating`, `sunken`, `overlay`, or
`transparent`. It binds the complete local surface alias bundle. Native disabled, invalid,
checked, selected, current, pressed, hover, focus, and active states remain authoritative.

Actions and selections are inherently interactive. Surfaces accept boolean `theme:interactive`;
actions, selections, and surfaces accept reactive boolean `theme:dragging`, which also implies an
interactive surface. Native `disabled`, `aria-disabled`, and `aria-busy` represent unavailable and
loading states rather than duplicate theme props.

The depth-state recipe is normative. Primary and secondary actions rest at `shadow-sm`; quiet
actions and selections rest without a shadow; surfaces retain their resolved bundle shadow.
Hover-capable pointers raise physical actions to `shadow-md`, quiet actions and selections to
`shadow-sm`, and interactive surfaces by one available level. Solid actions add a contrasting
contact ring so the shadow remains distinct from their fill. Transient `:active` presses actions
and selections into `surface-sunken-shadow` and lowers interactive surfaces. `theme:dragging` uses
`shadow-lg`. Disabled state removes elevation; busy state preserves resting elevation; both
suppress hover, active, and drag depth. Focus-visible, invalid, checked, selected, current,
`aria-pressed`, and `aria-expanded` do not independently change depth. Overlay content uses the
`overlay` surface bundle. Flat and bordered themes resolve interaction shadows to `none`, reduced
motion makes transitions immediate, and forced colors removes decorative shadows.
Dark elevation uses progressively larger light halos at `shadow-sm`, `shadow-md`, and `shadow-lg`,
plus a dark contact shadow. The sunken bundle uses a light-edged inset shadow so pressed depth is
also visible against near-black surfaces. Hover recipes exclude `:active`, ensuring that the
pressed recipe wins the cascade while activation is held.

Visible surface recipes pad by `max(space-4, radius-lg)`. Transparent surfaces add no padding.
For `shape: pill`, `radius-sm` and `radius-md` remain `9999px` so controls are pill-shaped, while
`radius-lg` is bounded at `1.5rem` so arbitrary content surfaces remain safe rounded containers.
Native `progress` and `meter` field recipes apply
`clip-path: inset(0 round var(--exact-theme-radius-md))` so their internal fill remains inside the
configured track shape. Progress additionally uses Blink/WebKit and Firefox pseudo-elements to
paint an `accent-solid` fill over a `neutral-subtle` track because native `accent-color` behavior
is not interoperable. Explicit `theme:tone` selects that tone's solid fill. Meter retains native
rendering with its tone supplied through `accent-color`.

## Exterior derivation

`createThemeDeriver()` validates a versioned, synchronous, data-only deriver. `deriveTheme()`
passes an immutable context with the source fingerprint, appearance, contrast, key, neutral,
surfaces, tones, tonal palettes, hue harmonization, contrast adjustment, and CSS serialization.
Derivers do not inspect computed style or register global callbacks.

`deriveDataColors()` provides categorical sets of 1–12 colors, sequential sets of 2–12, and odd
diverging sets of 3–11. It returns opaque colors, readable foregrounds, strokes, repeating
non-color patterns, and distance warnings. Inputs and output ordering are deterministic. Charts
must retain labels, symbols, patterns, or a table whenever color carries meaning.

export const syntaxTheme = createThemeDeriver<SyntaxRequest, SyntaxTheme>({
id: '@acme/editor/syntax',
version: 1,
derive(theme, request) {
// Pure bounded derivation from theme.key, theme.tones, and request.
}
});

```

Deriver IDs are diagnostic and cache identities, not authorization or global registry keys. A
consumer imports and invokes the deriver normally.

## Inspection and testing

DevTools should display, without requiring production source values:

- contract, source fingerprint, temperament ID/version, appearance, and revision;
- authored, inherited, system-selected, and defaulted source fields;
- resolved semantic tokens and their contrast checks;
- the theme scope owning an element and the active surface bundle;
- enhancement role, variant, effective tone, inferred native states, and effective size;
- `theme:override` patches separately from generated values; and
- deriver ID/version and bounded input/output summaries, never application-confidential data.

Minimum implementation protection is:

1. golden resolver fixtures for every built-in temperament across light/dark and standard/more;
2. property tests for finite output, gamut, deterministic serialization, monotonic surface/state
   intervals, and required contrast;
3. recipe tests for every role, variant, tone, size, and native/ARIA state priority;
4. DOM tests proving one scope variable replacement updates descendants without remounting;
5. nested-theme and surface-context tests across conditional output, SSR, hydration, and cleanup;
6. forced-colors and reduced-motion browser tests;
7. derivation fixtures across categorical counts and sequential/diverging bounds; and
8. package-content and platform-boundary checks for the published enhancement facade and CSS.

Exact CSS snapshots are appropriate here because variable names and recipe declarations are the
supported interoperability contract. Resolver tests should otherwise prefer semantic invariants
over incidental floating-point serialization beyond the documented rounding boundary.

## Acceptance application: Theme Lab

`@exactjs/theme` must not be accepted from resolver fixtures and isolated recipe tests alone. The
implementation must add a public, production-built Theme Lab sample page that composes the
portable vocabulary in a realistic interface. A swatch sheet or static Storybook story does not
satisfy this requirement.

The preferred docs route is `/examples/theme-lab`. The sample may live in the documentation
application or in a separately built sample application linked from that route, but it must use the
published `@exactjs/theme` package and enhancement facade rather than repository-private imports.

### Root theme controls

The page must expose ordinary labelled native controls for the root scope:

- a key-color control that accepts both a visual color selection and an editable CSS color value;
- a temperament select containing every built-in temperament;
- an appearance select with `system`, `light`, and `dark`;
- a contrast select with `system`, `standard`, and `more`;
- density, shape, depth, and typography selects so the independent structural axes remain visible;
- a motion select with `system`, `full`, and `reduced`; and
- a reset action that restores the documented root defaults.

Every accepted edit must mutate ordinary component state and update the existing `Theme` source.
Invalid color text must retain the last valid resolved theme, mark the field invalid, and display a
text error. Controls must not remount when their own theme changes.

The sample must display the active source fingerprint, resolved appearance, temperament ID/version,
revision, and active system preferences. It should expose selected resolved tokens for inspection,
but the primary demonstration must be composed UI rather than a token table.

### Representative themed specimen

The root scope and the nested scope described below must each contain the same reusable
`ThemeSpecimen` component. The specimen must use theme enhancements rather than scope-specific
classes and include at least:

- base, raised, sunken, and overlay-style surfaces, including two automatically nested surfaces;
- body, supporting, muted, heading, display, code, and explicitly toned text;
- primary, secondary, quiet, destructive-primary, and destructive-quiet actions;
- text, search, number, date, select, textarea, checkbox, radio, range, and progress controls where
  the platform exposes a meaningful native control;
- default, focused, disabled, required-invalid, and `aria-invalid` field examples;
- neutral, information, success, warning, and danger statuses with visible text or icons so color
  is never their only meaning;
- subtle and strong separators;
- subtle and strong selections driven by checked, pressed, selected, and current state; and
- enough wrapping prose to verify typography, spacing, zoom, and user text-spacing overrides.

Examples should remain interactive. Buttons must update local specimen state, selections must
change through native or ARIA state, and validation examples must be operable rather than painted
screenshots. The two specimens use the same component source so visual differences prove theme
portability rather than duplicated markup.
Distinct action and selection groups must retain a block-axis gap of at least `0.25rem`; the
specimen should otherwise derive that separation from `control-gap` so density changes remain
visible without allowing rounded controls in adjacent groups to merge.
The specimen must expose a live textual depth-state readout driven by the same pointer, keyboard,
and drag events as its controls. It reports the active state and effective shadow token so hover,
press, drag, and flat/bordered fallbacks can be verified without relying on subtle visual judgment.

### Independent component-library fixture

`ThemeSpecimen` and at least one interactive compound control used inside it must live in a
separately compiled workspace package with a normal published-style entry point, README, concise
application-author AGENTS guide, package-content test, and no import from the Theme Lab application.
The fixture may depend on the public `@exactjs/theme/enhancements` authoring facade and ordinary
eXact packages; it must not import theme resolver internals, application CSS, docs CSS, source-path
aliases, or private test helpers.

The Theme Lab consumes the built package entry under the same export conditions a third-party
application would use. One acceptance build must compile the fixture first, remove its source
directory from resolver reachability, and then build the Theme Lab from the packaged output. Both
root and nested specimens come from that artifact. This proves the attributed vocabulary and CSS
contract cross a package boundary rather than merely working between files in one application.

The fixture's compound control must export a semantic intrinsic through `_target` and apply at
least one role, tone, and size modifier internally. Acceptance verifies that provider selection,
target contribution, SSR, hydration, reactive theme changes, and absence fallback behave the same
as for directly authored intrinsics.

### Independently controlled nested theme

The root specimen must contain a visibly bounded nested theme area with its own key color,
temperament, appearance, and contrast controls. Its omitted density, shape, depth, typography, and
motion fields inherit from the root unless the sample offers an explicit Ã¢â‚¬Å“override inherited
axesÃ¢â‚¬Â control.

Acceptance requires demonstrating both directions of reactivity:

1. Changing a nested explicit field updates only the nested scope.
2. Changing an inherited root field updates both scopes while preserving every explicit nested
   selection.

The nested theme must reset automatic surface depth to zero, paint its own canvas, and contain the
complete reusable specimen. Switching either scope must preserve focused elements where valid,
control values, selections, validation state, scroll position, component identity, and chart data.

### Derived translucent area chart

Each specimen must contain the same reusable chart component. The chart must read
`ThemeContext.current` and `ThemeSurfaceContext.bundle`, call `deriveDataColors()` or a separately
published `ThemeDeriver`, and derive all series fill, stroke, point, label, grid, axis, tooltip, and
focus colors from that result and the resolved surface. It must not read computed style, hard-code
theme colors, or copy derived colors into component state.

The chart must be an accessible, responsive translucent area chart with at least three partially
overlapping series and intentional overlap regions. Requirements are:

- translucent fills make the overlap visually evident while opaque derived strokes preserve each
  series boundary;
- theme changes recompute derived colors reactively without replacing the chart component, SVG or
  canvas owner, data objects, or active selection;
- categorical colors are accompanied by the returned patterns or another non-color distinction;
- a visible legend directly labels every series and exposes the same pattern/symbol distinction;
- the chart has an accessible name and textual data summary or table;
- points or series reachable by keyboard expose values without depending on hover;
- grid, axes, labels, tooltips, focus indicators, fills, and strokes remain usable in light, dark,
  standard-contrast, more-contrast, and forced-colors presentations; and
- fill compositing is tested over every surface bundle used by the specimen rather than assuming a
  canvas background.

The chart deriver returns opaque base colors. The Theme Lab chart composites fills at alpha `0.24`
under standard contrast and `0.32` under more contrast, using premultiplied sRGB source-over
compositing over the current surface for its acceptance measurements. Strokes remain opaque and exactly two CSS pixels
at standard contrast and three at more contrast. If any individual fill or pairwise overlap has
OKLab distance below `0.04` from the surface or below `0.03` from another displayed composite, the
sample fails rather than choosing an undocumented alpha.

### Automated acceptance matrix

The Theme Lab must have browser-level tests covering at least:

| Case                                                    | Required observation                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Every temperament in light and dark                     | No missing contract variable, invalid CSS value, resolver warning treated as fatal, or unreadable required pairing.   |
| Root key, temperament, appearance, and contrast changes | One root publication; descendants restyle without component remounts or lost native state.                            |
| Nested explicit changes                                 | Root computed theme and root specimen remain unchanged.                                                               |
| Root inherited-axis changes                             | Nested inherited output changes; explicit nested key, temperament, appearance, and contrast remain unchanged.         |
| Standard and more contrast                              | Required text, component boundaries, chart strokes, and focus indicators meet the selected targets.                   |
| System appearance, contrast, and motion changes         | Every scope using `system` reacts; explicit scopes do not.                                                            |
| Surface nesting                                         | Automatic bundles advance and cap as specified; a nested `theme:scope` resets to bundle zero.                               |
| Chart derivation                                        | Output changes with theme revision and surface bundle while chart identity, data, and selection remain stable.        |
| Packaged fixture                                        | Built package output resolves no fixture source or application CSS and behaves identically in both theme scopes.      |
| Keyboard and native validation                          | Focus is visible, controls are operable, invalid state is explained, and chart values are available without hover.    |
| Forced colors and reduced motion                        | Semantic content remains understandable, focus remains visible, and nonessential transitions stop.                    |
| 200% zoom and WCAG text-spacing override                | Content reflows without clipped controls, statuses, legends, errors, or chart data access.                            |
| SSR and hydration                                       | The selected root and nested themes paint before hydration and adopt without a theme flash or descendant replacement. |

Tests must record component instance identities or owned test markers before and after theme changes;
visual similarity alone does not prove the no-remount contract. Screenshot comparisons should cover
representative balanced, expressive, stark, and monochrome combinations, but semantic assertions,
contrast measurements, keyboard operation, and identity checks remain authoritative.

The implementation is not accepted until the Theme Lab passes this matrix in the production docs
build and a reviewer can change both theme scopes repeatedly without CSS overrides, selector
patches, hard-coded chart colors, console errors, hydration warnings, or visible stale-theme frames.

## Rejected alternatives

### Generate one complete stylesheet per theme in the document head

Rejected because runtime insertion complicates SSR, cleanup, CSP, multiple roots, nested scopes,
and reactive replacement. Static recipes plus scope-local variables provide the same expressivity
with natural cascade ownership.

### Let every enhancement compute concrete colors

Rejected because it repeats work, scatters contrast correction, creates inconsistent
interpretations, and requires per-element theme updates. Enhancements select roles; the scope owns
resolution.

### Perform all generation in CSS

Rejected because `color-mix()` and relative colors cannot provide identical server/browser
results, complete OKLCH gamut mapping, contrast search, warnings, or extension derivation. CSS
consumes the resolved result.

### Expose only raw scales

Rejected because independent libraries would choose different steps for the same meaning. The
portable contract is semantic; primitive scales remain available only through the typed derivation
context.

### Combine tone and prominence into one action value

Rejected because destructive intent and visual prominence are independent. `primary-danger`,
`quiet-danger`, and every future cross-product would grow without bound. The common case remains
compact as `theme:action="primary"`; exceptional meaning composes with `theme:tone="danger"`.

### Treat every nested surface as a nested theme

Rejected because surface depth and theme identity are orthogonal. Re-resolving a palette for each
card or panel is wasteful and makes unrelated surfaces drift. A surface rebinds one generated
bundle within the existing theme.

### Let extensions read computed custom properties

Rejected because computed style is DOM-only, late, stringly typed, override-sensitive, and absent
during SSR. Pure derivers receive the immutable resolved source of truth.

### Make overrides visible to derivers

Rejected because a sparse CSS patch does not contain enough information to reconstruct primitive
palette relationships or prove contrast. A consumer needing coherent derived output creates a
nested theme source instead.

## Delivery sequence

1. Scaffold `@exactjs/theme` with its public export map, `styles.css` export, concise README,
   application-author AGENTS guide, package-content coverage, and reusable-skill discovery entry.
2. Implement color parsing, OKLCH conversion, gamut mapping, contrast search, immutable resolved
   types, and golden/property tests in a package-internal resolver.
3. Materialize `exact-theme/1` metadata and generate the default root declarations from one golden
   resolved theme.
4. Implement `theme:scope` as an ordinary component-library enhancement with system preference
	ownership, SSR serialization, hydration adoption, and reactive inheritance; keep typed overrides
	an ordinary wrapper helper.
5. Implement surface context and the seven element roles through the existing enhancement contract.
6. Publish static recipe CSS, forced-colors behavior, inspection data, and exact contract tests.
7. Implement derivation contexts and built-in data colors, then dogfood them in a chart or board
   visualization.
8. Build the independent component-library fixture and required Theme Lab with its reusable
   specimens, independently controlled nested scope, and derived translucent area chart; pass the
   complete automated acceptance matrix.
9. Migrate one additional repository application without application-local selector overrides and
   evaluate authoring density, output size, theme-switch cost, and component portability before
   declaring the package stable.

## V1 implementation decisions and deferred work

No unresolved choice in this section blocks v1:

- live themes replace one owned ordered style attribute; v1 does not emit or deduplicate hashed
  classes;
- strict CSP configurations that forbid style attributes are a documented v1 limitation; a later
  nonce/hash/external-stylesheet adapter requires a separate ownership and cleanup proposal;
- existing enhancement language assistance exposes the typed finite activators, but the theme
	package adds no compiler behavior and does not attempt cross-package proof that every deriving
	component has an ancestor `theme:scope`;
- every declared typography preset ships with the exact stack above; and
- default CSS, recipe CSS, token category unions, and contract metadata are generated from one
  package-owned source and protected by exact snapshots.

Possible later hashed publication, CSP adapters, additional temperament data fields, new role
activators, wider-gamut output contracts, or typography presets are additive proposals or a new
contract version. Implementers must not introduce them opportunistically while delivering v1.
```
