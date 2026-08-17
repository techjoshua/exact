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

Built-in temperament version two varies surface hierarchy, interaction-state distance, accent and
status intensity, neutral tint, and status-hue harmonization. Density, shape, depth, typography,
contrast, appearance, and motion remain independent source axes.

The enhancement namespace includes `scope`, `surface`, `action`, `field`, `text`, `status`, `separator`, and `selection`; finite source fields and `tone` or `size` act as supported modifiers. Actions and selections receive automatic depth-aware hover and press states. Use `theme:interactive` for an interactive surface and bind `theme:dragging` to live drag state when an action, selection, or surface is being dragged. Native disabled and `aria-busy` state automatically suppress transient depth changes. The package requires no compiler or framework-runtime changes. Import the stylesheet once in the application entry point. Theme style attributes require an applicable Content Security Policy allowance.

## Reference

See the [semantic generative theming reference](../../docs/theme.md) for the complete source, token, enhancement, nesting, and derivation contracts.
