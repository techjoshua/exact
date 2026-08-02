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

The package also exports compilerless `Motion`, `animate()`, and `defineMotion()` APIs. Browser
drivers are loaded only by client/runtime entry points; importing definitions or presets on a
server does not access browser globals.

See [motion](../../docs/motion.md) for presence, layout, list, accessibility, and testing guidance.
