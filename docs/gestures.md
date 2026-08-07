# Gestures

`@exactjs/gestures` recognizes semantic input without owning animation, physics, or application
state. Definitions are prepared, immutable values; one stable component-owned session attaches to
the resolved intrinsic root and reconfigures without recreating the component.

## Prepared recognition

```ts
import { defineGesture } from '@exactjs/gestures';

export const movable = defineGesture({
	name: 'movable-card',
	semantics: 'control',
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
pan candidates arbitrate by explicit priority, threshold, and optional `exclusiveGroup`. They run
simultaneously only when both opt in. Nested logical targets use the same priority policy and
prefer the nearest target on a tie. Press and losing movement candidates receive cancellation
before the winner's first sample, and pinch cancels an active single-pointer candidate.

Slow move callbacks are bounded: one callback runs while only the latest pending sample is kept.
Synchronous callback return values are ignored; a returned thenable participates in that bounded
delivery and is awaited before the latest pending sample runs.
Capture loss, pointer cancellation, window blur, target deactivation, disabling, policy replacement,
and component disposal all cancel the owned session and restore inline touch and selection policy.

## Accessibility

Every definition declares `semantics: 'decorative' | 'control'`. Control-like definitions require
a keyboard policy at the type boundary. Arrow keys produce semantic move samples, while Enter and
Space produce press samples; omitted callbacks fall back to the definition's drag, pan, or press
callback. Hover policy treats focus as equivalent intent. Authors remain responsible for a
focusable target, an accurate accessible name, and any control-specific role.

## Namespaced enhancement composition

The canonical namespace accepts `apply`, `press`, `hover`, `drag`, `pan`, `pinch`, and `disabled`.
The shared compiler and renderer carry grouped markers and ordinary transparent enhancement components.
Vite includes reached attributed capabilities in its bundle-local catalog and supplies them to
DOM, hydration, and SSR.

```tsx
import gesture from '@exactjs/gestures' with { type: 'exact-enhancement' };

<button onClick={() => openCard(card.id)} gesture:apply={movable}>
	Open or move card
</button>;
```

Here the authored click remains required fallback behavior. The optional wrapper adds reusable
pointer capture, keyboard movement, cancellation, and cleanup without owning the button's design.
If the final application excludes the capability, the button still opens the card. Continue to use
explicit `GestureElement` when gesture behavior itself is required or the caller is compilerless:

```tsx
<GestureElement apply={movable}>
	<article tabIndex={0}>Drag me or use the arrow keys</article>
</GestureElement>
```

`@exactjs/gestures/testing` provides an injectable monotonic clock for deterministic thresholds,
velocity, long press, and cancellation tests.
