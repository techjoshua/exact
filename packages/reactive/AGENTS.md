# Using `@exactjs/reactive`

See the [README](./README.md) for primitives and examples. Most components should use direct
`this.state` access; use this package for standalone reactive models or framework integrations.

- Use native-looking object, array, `Map`, and `Set` operations on reactive values.
- Use `computed()` for reusable pure values and `watch()` for low-level observed effects.
- Read computed values directly when current data is required; transitive reads settle without a
  global scheduler flush. Unwatched standalone computeds remain pull-only, while effect scopes own
  durable framework computations.
- Prefer component-owned transactions and optimistic actions over application-managed shadow stores.
