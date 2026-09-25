# @exactjs/theme

`@exactjs/theme` turns a compact set of visual primitives into a deterministic, accessible semantic theme. Use it when application and component-library markup should share one vocabulary without sharing concrete CSS values.

## Setup

```tsx
import { _ } from '@exactjs/jsx';
import * as theme from '@exactjs/theme/enhancements' with { type: 'exact-enhancement' };
import '@exactjs/theme/styles.css';

<_ theme:scope theme:tonic="teal" theme:temperament="balanced">
	<button theme:action="primary">Save</button>
</_>;
```

## Runtime contract

`theme:scope` publishes the complete `exact-theme/1` contract through an enhancement-owned wrapper and reacts to source, inherited-theme, and system-preference changes. `theme:tonic` accepts a curated tonic name or any opaque `ThemeColor`, including context-free CSS Color 4 and DTCG values. Nested scopes may omit an axis or pass `inherit` explicitly, including for `theme:tonic` and `theme:temperament`. `createThemeOverride()` validates token-only CSS patches for ordinary wrapper style attributes. Exterior components can read `ThemeContext` and use `deriveTheme()` or `deriveDataColors()` for charts and other specialized palettes.

Built-in temperaments are cross-axis interval systems. They vary surface and interaction steps,
accent and status relationships, type scale and tracking, spacing and control progression, radius
and elevation progression, and motion cadence. Density, shape, depth, typography, contrast,
appearance, and motion still select their independent base axes; temperament tunes the
relationships within the selected axis rather than replacing it.

The enhancement namespace includes `scope`, `surface`, `action`, `field`, `text`, `status`, `separator`, and `selection`; finite source fields and `tone` or `size` act as supported modifiers. Actions and selections receive automatic depth-aware hover and press states. Use `theme:interactive` for an interactive surface and bind `theme:dragging` to live drag state when an action, selection, or surface is being dragged. Native disabled and `aria-busy` state automatically suppress transient depth changes. The package requires no compiler or framework-runtime changes. Import the stylesheet once in the application entry point. System appearance, contrast, and motion use generated media-query CSS during SSR, before hydration,
and with JavaScript disabled. Explicit values take precedence; nested scopes inherit requested
preferences. `ThemeContext.preferences` preserves `system`, while `ThemeContext.system` becomes
available on browser activation. Before then, resolved context values use a deterministic
light/standard/full reference. Theme style attributes and generated style elements require an
applicable Content Security Policy allowance.

Typography accepts presets or partial objects such as
`theme:typography={{ body: '"Example Sans", sans-serif' }}`. Unspecified fields inherit.
Scopes also accept custom temperament definitions and `theme:neutralColor` /
`theme:canvasColor` sources. Use nested scopes for local derivation.

Use `theme:appearance="inverse-system"` to oppose the browser preference, or `"inverse"`
to oppose the parent's effective appearance. Omitted settings inherit, including the background painting policy. Reactive scope inputs
control appearance; `data-exact-theme-appearance` exposes the requested choice and
`data-exact-theme-resolved-appearance` exposes the effective choice when known.
`ThemeContext.appearance` is undefined during SSR for browser-dependent choices.
Generated CSS selects both palette and native control appearance before activation.

## Reference

See the [semantic generative theming reference](https://github.com/techjoshua/exact/blob/main/docs/theme.md) for the complete source, token, enhancement, nesting, and derivation contracts.

[Documentation](https://techjoshua.github.io/exact/#/components/theme) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/theme)
