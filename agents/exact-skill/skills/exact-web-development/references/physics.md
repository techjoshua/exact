# Physics package

When an application installs `@exactjs/physics`, read its package-local `AGENTS.md`, README, and
the repository's current `docs/physics.md` reference before authoring simulation code.

- Create a world and its bodies during durable setup; dispose resources with their owner.
- Mutate bodies through queued commands and let the next fixed step publish a coherent snapshot.
- Use named ordered force contributors for scene policy, including optional gravity fields.
- Use manual stepping for deterministic tests, workers, servers, and offline calculation.
- Prefer the explicit `PhysicsElement` when DOM projection is required. Optional namespaced plugin
  attributes may remain inactive when the host does not advertise physics capability.
- Keep physics on `translate` and `rotate`; do not silently compete with authored channel values or
  with motion-owned opacity and scale.
