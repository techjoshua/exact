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
`defineMotion()` APIs. Use `Presence` for conditional leave and focus return, and `MotionList` for
stable keyed projection of reactive application collections. Browser drivers are loaded only by
client/runtime entry points; importing definitions or presets on a server does not access browser
globals.

See [motion](../../docs/motion.md) for presence, layout, list, accessibility, and testing guidance.
