# Motion

When an application installs `@exactjs/motion`, read its package-local `AGENTS.md`, README, and
exported declarations before editing motion code.

- Keep prepared definitions immutable and at module scope. Prefer the small preset entry when its
  public visual contract fits.
- Keep application state and final intrinsic styles authoritative. Motion owns a finite visual path,
  not a shadow state store.
- Use `MotionConfig` for inherited enabled, transition, appear, and reduced-motion policy.
- Use the explicit `Motion` component when compiler-owned namespaced activation is unavailable in
  the installed build host.
- Use `Presence` for conditional focus-safe leave, `MotionList` for application-owned keyed
  collections, and `LayoutGroup` with stable `layoutId` values for coordinated FLIP movement.
- Treat `animate()` playback as structured, cancelable task work. Do not retain raw browser
  animations outside component ownership.
- Follow the installed package surface for presence, list, layout, and router coordination; do not
  invent these APIs when the installed version does not export them.
