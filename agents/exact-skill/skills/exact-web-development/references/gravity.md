# Gravity package

When an application installs `@exactjs/gravity`, read its package-local `AGENTS.md`, README, and the
repository's current `docs/gravity.md` reference before authoring field policy.

- Prepare immutable fields outside render work and use consistent physics-world units.
- Give point and inverse-square fields positive softening and an appropriate acceleration cap.
- Register gravity through an existing physics world; never add another frame loop or integrator.
- Use body groups, collision layers, explicit sets, or stable predicates for selection.
- Prefer explicit `GravityField` or `GravityElement` components when gravity is required behavior.
