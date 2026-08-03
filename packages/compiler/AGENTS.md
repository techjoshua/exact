# Using `@exactjs/compiler`

See the [README](./README.md) for compiler entry points and examples. Applications should normally
use an official build integration; use this package directly for custom tooling or artifact
generation.

- Compile components as part of their TypeScript project so placement and ownership can be inferred.
- Consume generated client, server, hydration, and inspection artifacts as opaque build output.
- Consume supported build products rather than retaining or interpreting compiler analysis.
- Do not author operation, component, or registry protocol identities.
