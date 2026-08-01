# Using `@exactjs/testing`

See the [README](./README.md) for component and server test examples. Use the main package or a
runner integration so authored eXact test components pass through the normal compiler.

- Test observable behavior through mounted components and generated server contracts.
- Use `@exactjs/testing/internal/fixtures` only for low-level renderer, SSR, or hydration tests
  that intentionally construct raw native VNodes.
