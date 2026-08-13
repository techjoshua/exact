# Using `@exactjs/physics`

See the [README](./README.md) for setup and API orientation.

- Declare worlds and bodies in the outer component definition, and dispose worlds that the durable component owns.
- Keep simulation mutations on body commands so they become coherent at fixed-step boundaries.
- Use named force contributors for reusable scene policy and manual stepping for deterministic tests.
- Treat body pose as inspectable reactive state; do not mirror it into a second application store.
