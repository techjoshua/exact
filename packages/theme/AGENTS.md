# Using @exactjs/theme

Use this package when an eXact application or portable component library needs semantic styling backed by one deterministic generated theme.

Read the [README](./README.md) for setup and API orientation.

- Put `theme:scope` on a transparent range at deliberate scope boundaries and let nested values inherit.
- Author portable controls with the finite enhancement roles, not concrete theme colors.
- Mark only genuinely interactive surfaces with `theme:interactive`; bind `theme:dragging` to actual drag state and leave disabled or busy state to native and ARIA attributes.
- Use `createThemeOverride()` on an ordinary wrapper only for CSS token patches; create a nested `theme:scope` when derivation must change.
- Use `ThemeContext` plus a deriver for charts or other specialized palettes.
- Import `styles.css` once and account for its style-attribute CSP requirement.
- Use partial `theme:typography` objects for custom font families; omitted fields inherit. Load font assets with application CSS.
- Control appearance through reactive scope inputs. Read `ThemeContext.appearance` for the effective value (undefined while browser-dependent on the server); use emitted attributes only as CSS selectors.
