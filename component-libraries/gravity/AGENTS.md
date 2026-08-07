# Using `@exactjs/gravity`

See the [README](./README.md) for setup and API orientation.

- Prepare stable pure fields outside render work and sample them in world units per second squared.
- Apply fields through a `PhysicsWorld`; gravity never owns a frame loop or integration.
- Use positive softening and an acceleration cap for point or inverse-square fields.
- Prefer explicit `GravityField` or `GravityElement` components when gravity is required behavior.
