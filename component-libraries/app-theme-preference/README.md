# Repository application theme preference

This private component library gives eXact repository applications one shared light/dark
preference and a compact accessible toggle. It is intentionally unpublished: application shells
use it to share behavior without adding a framework package or public API.

Wrap a repository application in `ThemePreferenceProvider`, consume `ThemePreferenceContext` from
the application-owned compiler-authored theme scope, and render `ThemeModeToggle` inside that
scope. Import `@exactjs/app-theme-preference/styles.css` for the shared control styling. The
provider follows the operating-system color scheme by default and stores an override only while
the selected appearance differs from the system preference.
