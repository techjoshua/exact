# Accessibility

Prefer native HTML semantics and behavior. Use `@exactjs/accessibility` only for ref-based ARIA
relationships, focus entry/restoration, or a complete supported custom-composite keyboard policy.
Read the installed package's `AGENTS.md` and `README.md` before using its finite surface.

Register it package-wide when every owned component should receive the namespace and diagnostics:

```ts
// prettier-ignore
export * as a11y from '@exactjs/accessibility/enhancements' with { type: 'exact-enhancement', scope: 'package' };
```

Use `this.ref(createRef(...))` bindings for `a11y:labelledBy`, `describedBy`, `controls`, `details`,
`errorMessage`, `flowTo`, `owns`, and `activeDescendant`. Do not hand-generate IDs; valid authored
IDs are reused and eXact supplies stable platform UUIDs otherwise.

Use native modal dialog behavior:

```tsx
<button commandFor="settings" command="show-modal">Settings</button>
<dialog id="settings" modal:isOpen={this.state.settingsOpen} a11y:focusScope>...</dialog>
```

Do not combine `modal:isOpen` with `open`, reproduce focus trapping/inertness, or schedule framework
live-region announcements. Use native controls, labels, `details`, `popover`, live-region roles,
`:focus-visible`, and preference media queries directly.

`a11y:navigate` currently supports only `tablist`, `listbox`, `radiogroup`, `toolbar`, and `grid`.
It moves focus but does not invent selection, checked state, tab activation, or application data.
Keep those as ordinary component state and events. Treat provider errors as correctness failures;
dynamic or opaque name evidence remains unproven rather than automatically invalid.
