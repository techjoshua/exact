# Using `@exactjs/server`

See the [README](./README.md) for endpoint and executor setup. Use this package to serve generated
eXact operations, refreshes, and task continuations.

- Compose dispatch from compiler-generated contracts and the host's platform adapter.
- Validate all client input and expose only allowlisted operations.
- Register typed payload decoders for manual operations before authorization and business logic.
- Use `unsafeExactHtml()` only for reviewed authored markup; prefer SSR-owned rendering.
- Keep private services, captures, debug catalogs, and secrets on the server.
- Keep runtime observation collectors request-scoped; return them with that response and never
  retain a server-side cross-request timeline.
