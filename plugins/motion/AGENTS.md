# Using `@exactjs/motion`

See the [README](./README.md) for setup and API orientation.

- Prefer module-level definitions from `defineMotion()` or `@exactjs/motion/presets`.
- Keep application state and final element styles authoritative; motion owns only the visual path.
- Use namespaced `motion:*` attributes for one target and explicit components for structural policy.
- Put keyed layout participants under `LayoutGroup` and give shared participants stable `layoutId` values.
- Ensure every custom animation is finite and cancellation-aware.
