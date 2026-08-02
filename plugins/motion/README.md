# @exactjs/motion

Optional, task-owned motion for eXact components and intrinsic elements.

## Quick start

Use prepared definitions for reusable visual behavior and keep application state authoritative:

```tsx
import motion, { MotionConfig } from '@exactjs/motion';
import { fade } from '@exactjs/motion/presets';

<MotionConfig reducedMotion="system">
	<section motion:apply={fade}>Saved</section>
</MotionConfig>;
```

## Runtime boundary

The package also exports compilerless `Motion`, `Presence`, `MotionList`, `animate()`, and
`defineMotion()` APIs. Use `Presence` for conditional leave, focus return, and keyed replacement
ordering through `mode="sync" | "out-in" | "in-out"`; use `MotionList` for stable keyed projection
of reactive application collections. In-out sequencing waits for descendant enter playback before
releasing the previous range, while skipped reduced motion advances immediately. Wrap layout participants in
`LayoutGroup` and opt them into additive FLIP motion with `layout` and a stable `layoutId`. Browser
drivers are loaded only by client/runtime entry points; importing definitions or presets on a
server does not access browser globals. Prepared and dynamically resolved effects reject
non-finite timing. Reduced-motion policy uses an explicit reduced phase when supplied and otherwise
completes visual work immediately.

Later reactive insertions run their enter phase automatically. Initial client rendering and
hydration adoption require `appear`, and exact release reversal does not replay enter.

`createViewTransitionCoordinator()` can wrap a router or another framework publisher without
introducing a dependency between motion and that publisher.

See [motion](../../docs/motion.md) for presence, layout, list, accessibility, and testing guidance.
