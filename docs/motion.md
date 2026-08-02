# Motion

`@exactjs/motion` provides optional, task-owned visual transitions without making animation state
the source of truth. Application state and authored element styles remain authoritative; motion
controls only the finite visual path between committed states.

## Prepared definitions

Create reusable definitions at module scope with `defineMotion()` or import the side-effect-free
presets:

```ts
import { defineMotion } from '@exactjs/motion';

export const dialogMotion = defineMotion({
	enter: {
		keyframes: [
			{ opacity: 0, transform: 'translateY(8px) scale(.98)' },
			{ opacity: 1, transform: 'none' }
		]
	},
	leave: {
		keyframes: [
			{ opacity: 1, transform: 'none' },
			{ opacity: 0, transform: 'translateY(6px) scale(.98)' }
		]
	},
	reduced: 'skip'
});
```

Definitions and their static effects are validated and frozen. The initial preset entry exports
`fade`, `scale`, `pop`, `slideUp`, `slideDown`, `slideLeft`, and `slideRight`.

## Explicit components and playback

`Motion` is the compilerless intrinsic form:

```tsx
<Motion as="section" motion={dialogMotion} appear className="dialog">
	<DialogContents />
</Motion>
```

`MotionConfig` publishes inherited `enabled`, `reducedMotion`, `transition`, and `appear` policy
through one reactive context. `animate(element, effect)` is the low-level imperative seam; it
returns cancelable playback structurally attached to an immediate, nonblocking framework task
frame. Infinite effects are rejected by this finite helper.

The client plugin entry installs a Web Animations driver. Importing the main package, definitions,
or presets on a server does not read browser globals. `@exactjs/motion/testing` provides a
deterministic injected driver whose playbacks settle only when the test advances them.

## Plugin-owned JSX

The shared compiler and DOM renderer can carry grouped motion markers, resolve targets through
native component output, merge nearest props, and mount `MotionElement` as an ordinary transparent
component. The generated plugin-host capability catalog is still being connected, so application
code should use the explicit `Motion` component until that host integration is complete.

Presence sequencing, keyed motion lists, layout groups, shared layout identity, and router View
Transition publication remain under implementation and are not part of the current package
surface yet.
