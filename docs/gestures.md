# Gestures

`@exactjs/gestures` recognizes semantic input without owning animation, physics, or application
state. Definitions are prepared, immutable values; one stable component-owned session attaches to
the resolved intrinsic root and reconfigures without recreating the component.

## Prepared recognition

```ts
import { defineGesture } from '@exactjs/gestures';

export const movable = defineGesture({
	name: 'movable-card',
	drag: {
		axis: 'both',
		threshold: 4,
		lockDirection: false,
		onStart: () => (dragging = true),
		onMove: (sample) => {
			position.x = origin.x + sample.delta.x;
			position.y = origin.y + sample.delta.y;
		},
		onEnd: () => (dragging = false),
		onCancel: () => (dragging = false)
	},
	keyboard: {
		step: 8,
		onMove: (sample) => {
			position.x += sample.delta.x;
			position.y += sample.delta.y;
		}
	},
	touchAction: 'none'
});
```

The package exports `pressable`, `hoverable`, `draggable`, `pannable`, `pinchable`, and
`longPress` policy presets. `definePress()`, `defineHover()`, `defineDrag()`, `definePan()`, and
`definePinch()` prepare site-specific override recognizers.

## Semantic sessions

`GestureSample` contains the session phase, pointer type, viewport and local points, accumulated
delta, sampled velocity, elapsed monotonic time, cancellation signal, and original event. Drag and
pan candidates arbitrate by explicit priority and threshold. They run simultaneously only when
both opt in. Press is suppressed once movement wins, and pinch cancels an active single-pointer
candidate before its first sample.

Slow move callbacks are bounded: one callback runs while only the latest pending sample is kept.
Capture loss, pointer cancellation, window blur, target deactivation, disabling, policy replacement,
and component disposal all cancel the owned session and restore inline touch and selection policy.

## Accessibility

Control-like gestures need a keyboard path. The definition-level `keyboard` recognizer maps arrow
keys to semantic move samples, while hover policy treats focus as equivalent intent. Authors remain
responsible for a focusable target, an accurate accessible name, and any control-specific role.

## Plugin-owned JSX

The canonical namespace accepts `apply`, `press`, `hover`, `drag`, `pan`, `pinch`, and `disabled`.
The shared compiler and renderer already carry grouped markers and ordinary transparent plugin
components. Generated plugin-host capability catalogs are still being connected, so use explicit
`GestureElement` when the behavior is required by the current application build.

`@exactjs/gestures/testing` provides an injectable monotonic clock for deterministic thresholds,
velocity, long press, and cancellation tests.
