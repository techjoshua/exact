# Using `@exactjs/hydrate`

See the [README](./README.md) for hydration entry points. Use this package to adopt server-rendered
eXact HTML and activate compiler-generated islands.

- Hydrate the same compiled application that produced the server output.
- Use `@exactjs/hydrate/root` only when the application has no compiler-generated server work,
  response patches, or client islands; otherwise use the main entry.
- Choose mismatch recovery deliberately.
- Use the `/enhanced` entry when manually supplying an enhancement catalog; compiler-resolved
  enhancement modules activate hydration support automatically.
- Use generated operation, component, registry, and invocation identities without rewriting them.
- Keep transport invocation and patch authority behind `ExactClient`; use its root-scoped methods
  only when an integration genuinely needs them.
