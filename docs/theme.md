# Semantic generative theming

`@exactjs/theme` resolves a compact visual source into the deterministic `exact-theme/1` CSS custom-property contract. It is an optional component library: applications opt into its stylesheet and semantic enhancement namespace, while ordinary HTML behavior remains browser-owned.

## Setup

```tsx
import { _ } from '@exactjs/jsx';
import * as theme from '@exactjs/theme/enhancements' with { type: 'exact-enhancement' };
import '@exactjs/theme/styles.css';

<_ theme:scope theme:tonic="teal" theme:temperament="balanced">
	<button theme:action="primary">Save</button>
</_>;
```

An application may activate the enhancement namespace package-wide from `exact.config.ts`. The stylesheet contains one static balanced fallback plus role recipes; it performs no runtime style injection.

The eXact documentation shell uses this same contract for its application chrome. Its persisted
light, dark, or system preference drives a reactive root `theme:scope`; layout remains docs-owned,
while shell colors, surfaces, fields, actions, focus, and shadows come from generated theme values.
Documentation code blocks use the nearest theme's sunken surface, code typography, semantic tone
colors, and themed copy action rather than maintaining a separate fixed light or dark palette.
Workbench, Enhancement Playground, Kanban, Shipping Calculator, and Puzzle Foundry also consume the
package in their application shells. They retain application-owned layout, drag behavior, route
maps, and printable document styling rather than treating the theme package as a general UI runtime.

## Source and reactivity

Declarative scopes accept the curated tonic names `teal`, `blue`, `violet`, `amber`, `rose`, and `green`, or any opaque context-free CSS Color 4 or DTCG color accepted by `ThemeColor`. The names are conveniences rather than a closed palette. A temperament—`balanced`, `restrained`, `expressive`, `dramatic`, `soft`, `stark`, or `monochrome`—controls the intervals among color, surface, state, typography, spacing, control, shape, depth, and motion values. Appearance, density, shape, depth, typography, contrast, and motion remain independent base axes. Every nested source axis inherits when omitted, and each accepts explicit `inherit`, including `theme:tonic` and `theme:temperament`. `system` appearance, contrast, and motion follow their media queries.

The built-in temperaments are calibrated as visual interval systems rather than saturation presets.
`restrained` compresses hierarchy, scale, spacing, elevation, and timing intervals; `expressive`
uses vivid accents with broader typographic, spatial, and state progression; `dramatic` makes
hierarchy and cadence more decisive without maximizing chroma; `soft` combines the closest color
and state steps with gentle type, shape, depth, and generous line-height relationships; `stark`
uses achromatic neutrals and the strongest tonal, typographic, spatial, and depth separation; and
`monochrome` removes chroma while retaining its own structural rhythm. `balanced` remains the
moderate baseline.
Light surfaces are distributed around the canvas before the near-white cap, so raised levels do
not collapse together. Solid hover and active states move away from their selected readable
foreground, preserving the temperament interval in both appearances. Status chroma follows the
temperament's accent relationship instead of using one common saturation floor.

The categorical source axes remain authoritative. A flat theme never gains shadows, reduced motion
never gains duration, square shape remains square, and an editorial typography choice retains its
font families. Temperament tunes the scale ratios, tracking and weight separation, line-height
cadence, spacing ladder, control-size progression, radius ladder, shadow progression, and duration
ladder available inside those choices.

The Theme Lab pairs tonic presets with native color-picker controls for both root and nested scopes. Choosing a color switches that scope to `custom` and applies the selected color reactively without remounting its contents.

The public documentation shell also uses a root theme scope. Its header menu persists appearance,
tonic, temperament, density, shape, depth, typography, contrast, and motion choices. Explicit light
and dark appearances are reflected on the document root so browser-owned chrome such as scrollbars
uses the same color scheme; `system` continues to follow the operating-system preference. Documentation
chrome, cards, demos, dialogs, navigation targets, callouts, and code blocks use the semantic
enhancements directly. Code blocks are sunken surfaces, so flat, bordered, and elevated depth choices
control their exterior border and shadow without changing syntax semantics or internal separators.
Documentation code blocks request a local vivid syntax palette from the active theme. The deriver
follows the selected appearance by default, searches each semantic hue's accessible sRGB gamut for
the most chromatic color that retains text contrast, and keeps inverse presentation as an explicit
option. Monochrome temperament remains achromatic. The surrounding semantic surface still owns the
code block's border, radius, and depth behavior.
The lab's host-page control rules explicitly exclude themed actions, fields, and selections, so page-level hover, focus, and disabled colors cannot replace the generated contract while inspecting a theme.

Every runtime theme scope establishes `font-body`, `font-size-md`, and `line-height-body` on its wrapper. Native descendants and themed controls that use `font: inherit` therefore follow the selected typography preset, while heading/display and code roles switch to their dedicated generated families and scales.

`theme:scope` is an ordinary eXact enhancement. Activate it on a transparent `_` range; it owns a real `div`, `section`, `article`, `aside`, or `main` wrapper and resolves the complete immutable theme before replacing that wrapper's ordered style attribute. Descendants consume live CSS variables, so source changes do not remount controls or charts. A nested scope resets surface depth and re-resolves inherited source fields. `theme:override` publishes validated sparse token changes without changing `ThemeContext`, revision, fingerprint, or exterior derivation. No compiler, DOM, SSR, hydration, or core-runtime changes are part of this package.

V1 style publication requires a Content Security Policy that permits application style attributes.

## Semantic element contract

The package exposes one scope activator and seven element-role activators:

| Activator         | Values                                                                   | Modifiers                  |
| ----------------- | ------------------------------------------------------------------------ | -------------------------- |
| `theme:scope`     | `true`                                                                   | source fields              |
| `theme:surface`   | `auto`, `base`, `raised`, `floating`, `sunken`, `overlay`, `transparent` | `interactive`, `dragging`  |
| `theme:action`    | `primary`, `secondary`, `quiet`                                          | `tone`, `size`, `dragging` |
| `theme:field`     | `default`, `subtle`, `bare`                                              | `tone`, `size`             |
| `theme:text`      | `body`, `supporting`, `muted`, `heading`, `display`, `code`              | `tone`                     |
| `theme:status`    | `neutral`, `info`, `success`, `warning`, `danger`                        | `size`                     |
| `theme:separator` | `subtle`, `strong`                                                       | none                       |
| `theme:selection` | `subtle`, `strong`                                                       | `tone`, `size`, `dragging` |

`tone` accepts `neutral`, `accent`, `info`, `success`, `warning`, or `danger`; `size` accepts `small`, `medium`, or `large`. Exactly one activator labels an element. Native disabled, invalid, checked, selected, current, pressed, hover, focus, and active state remains authoritative.

### Choosing an enhancement value

Use the value that describes the element's job, not the visual result you happen to want. The
temperament and other source axes decide how that job looks. Boolean shorthand selects the ordinary
default for roles that have one: `theme:surface` means `auto`, `theme:action` means `secondary`,
`theme:field` means `default`, `theme:text` means `body`, and both `theme:separator` and
`theme:selection` mean `subtle`.

| `theme:surface` value | Use it for                                                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto`                | An ordinary nested container. It reads the nearest numeric surface bundle, advances one level (capped at 3), binds that level's foreground, background, borders, shadow, and padding, and publishes the new level to descendants. |
| `base`                | Content that must return to the scope's base surface rather than continue automatic nesting.                                                                                                                                      |
| `raised`              | A card, panel, or grouped region that should sit one level above its parent. It has the same depth step as `auto`, but states the intent explicitly.                                                                              |
| `floating`            | A popover-like or especially prominent region that should sit two levels above its parent.                                                                                                                                        |
| `sunken`              | An inset well, recessed control group, or content area that should look pressed into its surroundings.                                                                                                                            |
| `overlay`             | Overlay content such as a menu, dialog panel, or tooltip whose surface must remain above ordinary content.                                                                                                                        |
| `transparent`         | A semantic surface/context boundary that must add no background, border, shadow, or padding.                                                                                                                                      |

`auto` automates generated surface-level composition only. It does not inspect layout or content,
infer whether something is a card or overlay, make a surface interactive, or infer drag state.
Choose `sunken`, `overlay`, or `transparent` when those semantics are intended; set
`theme:interactive` and `theme:dragging` explicitly for interaction state. If the parent context is
the nonnumeric `sunken` or `overlay` bundle, automatic numeric composition starts from the scope base
and selects level 1.

| `theme:text` value | Use it for                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `body`             | Normal prose, labels, values, and other primary reading text. It uses the scope's body family and normal size.                                 |
| `supporting`       | Secondary explanations, metadata, captions, and helper text. It uses muted color and a smaller size.                                           |
| `muted`            | De-emphasized text that should retain its surrounding size, such as a secondary value inside a heading or table row.                           |
| `heading`          | Section and component headings. It uses the display family, strong weight, and heading scale.                                                  |
| `display`          | A page hero, major identity, or exceptional headline. It is deliberately much larger than `heading`; do not use it for routine section titles. |
| `code`             | Source code, commands, identifiers, or data where monospaced character alignment is meaningful.                                                |

In particular, choose `body` when the text is part of the normal reading flow, `supporting` when it
explains or qualifies nearby primary content, and `display` only when the text establishes the
identity of a page or similarly prominent region.

| `theme:action` value | Use it for                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `primary`            | The main action in the current decision area. Prefer one primary action per closely related group.                         |
| `secondary`          | A normal alternative or supporting action that still needs a visible control boundary.                                     |
| `quiet`              | A low-emphasis contextual action, toolbar command, or destructive text action whose boundary should appear on interaction. |

| `theme:field` value | Use it for                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `default`           | Ordinary editable, selectable, or native value controls with the clearest surface boundary.                    |
| `subtle`            | Fields placed in dense panels or grouped forms where a softer filled background separates the control.         |
| `bare`              | Search, toolbar, or composite-control fields whose containing component already supplies the visible boundary. |

| `theme:selection` value | Use it for                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `subtle`                | Tabs, filters, segmented choices, or toggles where selected state should be visible without competing with an action. |
| `strong`                | The selected item in a compact high-emphasis switcher when the active choice needs a solid fill.                      |

| `theme:status` value | Use it for                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `neutral`            | Informational state with no positive, cautionary, or failure meaning.                                |
| `info`               | Helpful information or a notable in-progress fact.                                                   |
| `success`            | Confirmed completion, validity, availability, or another positive outcome.                           |
| `warning`            | A recoverable risk or condition that deserves attention before proceeding.                           |
| `danger`             | Invalid input, destructive consequence, failure, or another condition requiring immediate attention. |

`theme:separator="subtle"` divides nearby related content; `strong` marks a major boundary between
regions. The `tone` modifier chooses semantic meaning independently of role: use `neutral` for
ordinary UI, `accent` for brand or selected emphasis, and `info`, `success`, `warning`, or `danger`
only when that meaning is real. The `size` modifier changes the generated control height and inline
padding: `small` is for dense secondary UI, `medium` is the default, and `large` is for prominent or
touch-forward controls. Size does not change semantic importance.

Actions and selections are inherently interactive. Set `theme:interactive` on an interactive surface and keep `theme:dragging` synchronized with application drag state on an action, selection, or surface; dragging implies an interactive surface. Native `disabled`, `aria-disabled`, and `aria-busy` continue to supply availability and loading state.

Depth behavior follows one state model:

| State         | Depth behavior                                                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rest          | Primary and secondary actions use `shadow-sm`; surfaces retain their resolved bundle shadow.                                                                                                                                                                                               |
| Hover         | On hover-capable pointers, physical actions rise to `shadow-md`, quiet actions and selections to `shadow-sm`, and interactive surfaces advance toward the next available shadow level. Solid actions also receive a contrasting contact ring so their shadow cannot merge with their fill. |
| Active        | Transient `:active` presses actions and selections into `surface-sunken-shadow`; interactive surfaces descend to a sunken or lower available level.                                                                                                                                        |
| Dragging      | `theme:dragging` raises the element to `shadow-lg` and uses the grabbing cursor.                                                                                                                                                                                                           |
| Focus-visible | Depth remains unchanged; the focus ring remains the authoritative keyboard signal.                                                                                                                                                                                                         |
| Disabled      | Elevation is removed and hover, active, and drag depth are suppressed.                                                                                                                                                                                                                     |
| Busy          | Resting depth is preserved while hover, active, and drag depth are suppressed.                                                                                                                                                                                                             |
| Open overlay  | `theme:surface="overlay"` supplies overlay depth; `aria-expanded` itself does not change the trigger.                                                                                                                                                                                      |

The `flat` and `bordered` sources resolve the shadow scale to `none`, so their interaction feedback remains color and border based. Reduced motion resolves transition durations to zero, and forced-colors mode removes decorative shadows. Persistent `checked`, selected, current, and `aria-pressed` states select colors without pretending to be a transient physical press. Fields, statuses, and semantic validation states do not acquire elevation.

Dark elevation uses a restrained light halo that grows across `shadow-sm`, `shadow-md`, and `shadow-lg`, plus a dark contact shadow for separation. Pressed controls switch to a contrasting inset ring and light-edged inset shadow. Hover recipes explicitly stop applying during `:active`, so the pressed treatment wins while the pointer or activation key is held. This keeps every depth change perceptible against near-black surfaces instead of merely increasing an invisible black shadow.

Solid primary actions add an appearance-aware contact shadow derived from the current surface
foreground. This keeps elevation visible against saturated fills in both light and dark appearances
while secondary actions continue to use the shared surface depth scale directly.

The Theme Lab specimen includes a live textual depth readout. Hover or press **Save changes**, or drag **Drag me**, to see the active interaction state and effective shadow token; flat and bordered modes report `none`.

Native `progress` and `meter` fields clip their internal fill to `radius-md`, so round and pill shapes cannot paint through the track's curved edges.
Progress uses explicit Blink/WebKit and Firefox pseudo-element recipes because native `accent-color` support is not reliable across engines. Its default fill is `accent-solid`, its track is `neutral-subtle`, and an explicit `theme:tone` switches the fill to that semantic tone's solid color. All of those values remain reactive theme variables. Meter retains native rendering with the selected tone supplied through `accent-color`.
The Theme Lab specimen gives its native progress element an explicit accessible name because the
visual wrapping label is not exposed as that element's name in Chromium's accessibility tree.

Portable components can use the public structural variables for their own layout. Distinct control groups should use a density-aware gap with a nonzero floor; the Theme Lab specimen uses `max(control-gap, 0.25rem)` so adjacent rounded controls cannot visually merge.

For a sparse token patch, call `createThemeOverride(tokens)` and put the returned style string on an ordinary wrapper element. This preserves typed validation without expanding the enhancement vocabulary beyond finite values.

Surface enhancements rebind the complete local foreground, background, muted, border, strong-border, and shadow bundle. `auto` and `raised` advance one level, `floating` advances two, and automatic numeric depth caps at three. A nested `theme:scope` starts again at level zero.

Visible surfaces include density-aware padding that is never smaller than their container radius. The `pill` shape keeps control radii fully pill-shaped while bounding the large surface radius at `1.5rem`; arbitrary content containers therefore remain rounded rather than becoming stadiums whose content can cross curved edges. Transparent surfaces add neither visual treatment nor padding.

## CSS and JavaScript contracts

Every resolved theme publishes all 164 tokens described by `exactThemeContract.tokens`. Public variables begin `--exact-theme-`; recipe-private aliases begin `--_exact-theme-`. The public set covers six complete surface bundles, canvas and disabled roles, eleven roles for each of six semantic tones, typography, spacing, controls, radii, borders, shadows, durations, and easing.

`resolveTheme()` is pure and browser-independent. It parses context-free CSS Color 4 and DTCG colors, converts to OKLCH, maps chroma to sRGB with 24 fixed bisections, and searches the fixed 1,001-value lightness grid nearest-first for required contrast. Once the closest valid distance is proven, resolution stops; unattainable contrast still examines the complete grid to select the deterministic maximum. The resolver returns recursively frozen output with a deterministic fingerprint. `serializeThemeVariables()` returns a frozen null-prototype record in code-point order. Invalid input throws `ThemeResolutionError` without a partial publication.

The exact variable names, formulas, parsing matrices, preset values, validation ranges, override serialization, and role selectors remain normative in the [implemented design record](proposals/semantic-generative-theming.md). The exported `exactThemeContract` is the machine-readable token authority.

Application-selected translation of these same semantic roles into Tailwind, Bootstrap, or another
CSS system is designed in the [thematic presentation provider proposal](proposals/thematic-presentation-providers.md).
That proposal preserves `theme:*` as the portable component-library contract and separates runtime
presentation from finite build-time class discovery; it is not implemented API.

## Exterior derivation

Charts, editors, maps, and other specialized components read the nearest `ThemeContext.current` and optional `ThemeSurfaceContext.bundle`. `createThemeDeriver()` defines a synchronous versioned derivation, while `deriveTheme()` supplies immutable palette, harmonization, conversion, and contrast helpers. Derivers never scrape computed CSS and therefore work identically during SSR.

Categorical data palettes reserve the theme accent and its immediate perceptual neighborhood for
interaction and emphasis instead of returning that semantic color as a data series.

`deriveDataColors()` provides categorical sets of 1â€“12 colors, sequential sets of 2â€“12, and odd diverging sets of 3â€“11. Results include opaque colors, foregrounds, strokes, repeating non-color patterns, and distance warnings. Components still need labels, symbols, patterns, or a data table whenever color identity is necessary to understand the content.

The [Theme Lab](../apps/enhancement-playground/src/theme-lab.tsx) in the enhancement playground exercises live root and nested configuration, native controls and statuses from a separately built fixture package, and overlapping translucent area charts derived from each active scope. The public docs application links to that independently deployed sample.

Categorical colors advance around the key hue by the golden angle, harmonize through the active
temperament, and alternate between two appearance-specific lightness bands. In both light and dark
appearance the second band is lighter than the first; this preserves categorical separation without
turning yellow and green candidates into muddy low-lightness browns on light surfaces. Each result
is contrast-corrected against the requested surface and selected for OKLab distance from both the
semantic accent and the other colors in that request.

## Browser verification

Run the Theme Lab's rendered Chromium acceptance gate from the repository root:

```sh
npm run test:e2e:theme
```

This gate starts the enhancement playground source through Vite, owns and closes that server reliably on
Windows, and exercises real Chromium computed styles and accessibility output. It currently checks
reactive root publication, inherited and explicit nested scopes, stable DOM identity and native
state, all seven temperaments in light and dark, generated text and primary-action contrast,
scope-wide typography, checkbox and progress tonic color, a focused progress screenshot, hover and
pressed depth, and dark-mode light shadows. Console and page errors fail every test.

This is the first browser baseline, not a claim of complete cross-engine certification. Firefox and
WebKit projects, forced colors, zoom and text-spacing reflow, and SSR/hydration coverage from the
normative acceptance matrix remain additional gates to add. Keep unit and stylesheet-contract tests
for deterministic generation, but do not use them as evidence that a browser painted a native
control correctly.
