# Theme scopes and semantic styling

Read the installed `@exactjs/theme/AGENTS.md` and `README.md` first because its contract is versioned with the application.

- Import `@exactjs/theme/styles.css` once at the application boundary.
- Use `theme:scope` on a transparent range for a generated root or nested source; omitted nested fields remain reactive inherited inputs. `theme:tonic` accepts a curated name or any opaque `ThemeColor`.
- Label existing semantic HTML with one of `theme:surface`, `theme:action`, `theme:field`, `theme:text`, `theme:status`, `theme:separator`, or `theme:selection`.
- Use `theme:tone` and `theme:size` only as modifiers supported by the selected activator. Do not convert native state into parallel theme state.
- Use `createThemeOverride()` on an ordinary wrapper for typed sparse CSS-token overrides. It intentionally does not change the resolved JavaScript theme or exterior derivations.
- For charts and other specialized palettes, read `ThemeContext.current` and `ThemeSurfaceContext.bundle`, then call `deriveDataColors()` or a versioned deriver. Preserve labels, symbols, patterns, or a data table when color carries meaning.
- Theme source changes replace one complete scope map. Descendants should consume live variables or derivation context and must not subscribe individually or remount.
- Account for the v1 style-attribute Content Security Policy requirement.
