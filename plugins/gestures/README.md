# @exactjs/gestures

Optional prepared gesture recognition for eXact component and intrinsic roots.

## Quick start

Keep application state authoritative and prepare recognition policy once:

```tsx
import gesture from '@exactjs/gestures' with { type: 'exact-plugin' };
import { defineGesture } from '@exactjs/gestures';

const movable = defineGesture({
	drag: {
		threshold: 4,
		onMove(sample) {
			position.x = origin.x + sample.delta.x;
			position.y = origin.y + sample.delta.y;
		}
	},
	keyboard: { step: 8 },
	touchAction: 'none'
});

<article gesture:apply={movable} tabIndex={0} />;
```

## Runtime boundary

The package normalizes pointer, hover, focus, keyboard, and pinch input into immutable semantic
samples. Sessions own pointer capture, temporary policy, cancellation, coalesced move delivery, and
cleanup. They do not own animation, simulation, or application data.

Use the explicit transparent `GestureElement` when recognition is functionally required. Vite
activates reached attributed imports through the application bundle's local enhancement catalog.
See [gestures](../../docs/gestures.md) for the complete current surface.
