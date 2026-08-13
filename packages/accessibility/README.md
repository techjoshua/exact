# @exactjs/accessibility

Native-first accessibility enhancements and package-owned diagnostics for eXact. Use the package
for ref-based ARIA relationships, bounded focus entry/restoration, and keyboard management of
custom ARIA composites. Continue to prefer native controls, `dialog`, `popover`, live-region roles,
and `:focus-visible` whenever the browser already owns the behavior.

## Usage

Register the namespace package-wide when every component should receive its diagnostics:

```ts
// exact.config.ts
// prettier-ignore
export * as a11y from '@exactjs/accessibility/enhancements' with { type: 'exact-enhancement', scope: 'package' };
```

Then attach narrowly scoped behavior without wrapper markup:

```tsx
const help = this.ref(helpKey);

<span ref={help}>Use at least twelve characters.</span>
<input aria-label="Password" a11y:describedBy={help} />
```

## Reference

See the [accessibility reference](../../docs/accessibility.md) for supported relationships,
navigation patterns, diagnostics, and native-first guidance.
