# Using `@exactjs/devtools-runtime`

See the [README](./README.md) for runtime attachment. Use this package to expose bounded,
policy-controlled inspection data from an eXact application.

- Install one runtime for the owning application root.
- Keep inspection read-only and value exposure within the configured policy.
- Aggregate request-returned server observations only in the page-owned bounded event store.
- Dispose runtime registrations with their application or microfrontend root.
