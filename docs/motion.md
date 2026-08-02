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

## Presence and keyed collections

`Presence` makes removed content semantically absent while its finite leave work settles. It moves
focus to an optional return target, applies `inert` and disables pointer interaction, and restores
the same connected DOM generation when presence reverses before leave completion:

```tsx
<Presence when={this.state.showDialog} returnFocus={this.ref.openButton}>
	<Motion as="dialog" motion={dialogMotion}>
		<DialogContents />
	</Motion>
</Presence>
```

`MotionList` projects an application-owned reactive collection through eXact's native keyed-list
primitive. Mutate `this.state` normally; reorders retain component and DOM identity, removals use
the renderer's generation-fenced release path, and duplicate keys fail immediately:

```tsx
<MotionList items={this.state.cards} getKey={(card) => card.id}>
	{(card) => (
		<Motion as="article" motion={cardMotion}>
			{card.title}
		</Motion>
	)}
</MotionList>
```

Neither component keeps a shadow copy of application data or exposes a manual retention token.

Set `exitLayout="pop"` when a leaving list item should keep its last viewport geometry without
occupying collection layout. The package restores the authored inline position and dimensions if
that keyed generation is reinserted before leave settles.

## Layout motion

`LayoutGroup` scopes measurement and shared `layoutId` identity. A `MotionList` inside the group
captures participant rectangles before publishing a keyed collection update and plays additive
FLIP effects after the DOM has moved:

```tsx
<LayoutGroup id="cards">
	<MotionList items={this.state.cards} getKey={(card) => card.id} exitLayout="pop">
		{(card) => (
			<Motion as="article" layout="position" layoutId={card.id} motion={cardMotion}>
				{card.title}
			</Motion>
		)}
	</MotionList>
</LayoutGroup>
```

Use `layout="position"`, `layout="size"`, or `layout="both"`; `layout` alone means both. Layout
keyframes use additive transform composition, so they do not replace an authored transform.

## Plugin-owned JSX

The shared compiler and DOM renderer can carry grouped motion markers, resolve targets through
native component output, merge nearest props, and mount `MotionElement` as an ordinary transparent
component. The generated plugin-host capability catalog is still being connected, so application
code should use the explicit `Motion` component until that host integration is complete.

Presence, keyed motion lists, scoped layout measurement, and shared layout identity are available.
Presence sequencing policies and router View Transition publication remain under implementation.
