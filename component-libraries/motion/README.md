# @exactjs/motion

An eXact component library for optional, task-owned motion on components and intrinsic elements.

## Quick start

Use prepared definitions for reusable visual behavior and keep application state authoritative:

```tsx
import motion from '@exactjs/motion' with { type: 'exact-enhancement' };
import { MotionConfig } from '@exactjs/motion';
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
`LayoutGroup` and opt them into additive FLIP motion with `layout` and a stable `layoutId`. The
main runtime uses a browser-safe Web Animations driver by default. Importing definitions or presets on a server
does not access browser globals. Prepared and dynamically resolved effects reject
non-finite timing. Component-owned enter/change phases may opt into `iterations: Infinity`; those
loops are detached from structural settlement but cancel with their owner. Leave and `animate()`
remain finite. Reduced-motion policy uses an explicit reduced phase when supplied and otherwise
completes visual work immediately.

Later reactive insertions run their enter phase automatically. Initial client rendering and
hydration adoption require `appear`. Exact release reversal runs enter from the interrupted
computed frame while retaining the same component and DOM generation.
Leave cancels active enter/change playback first, while Activity parking cancels visual work
without starting leave. Runtime driver installations restore active application leases correctly
even when application roots dispose out of order.

This package has no framework-plugin manifest or host lifecycle. `@exactjs/motion/testing` exports
`createMotionTestDriver()` and `installMotionDriver()` as ordinary, explicitly owned test helpers.

`createViewTransitionCoordinator()` can wrap a router or another framework publisher without
introducing a dependency between motion and that publisher.

See [motion](../../docs/motion.md) for presence, layout, list, accessibility, and testing guidance.
