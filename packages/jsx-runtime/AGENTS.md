# Using `@exactjs/jsx`

Use this package with native eXact TSX. See the [README](./README.md) for configuration and limits.

- Let eXact tooling compile component definitions and select the JSX runtime.
- In ordinary TSX helpers outside a component, instantiate only already-compiled components with
  the matching target; keep intrinsic elements and enhancements inside native component render work.
- Author JSX rather than calling the automatic or key-after-spread host entrypoints manually.
- Use ordinary DOM event callbacks and finite registry component values.
- Use self-closing `_target` for one supplied logical child, or an explicit fragment for several.
