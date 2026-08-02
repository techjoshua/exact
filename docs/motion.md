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

Definitions and their static effects are validated and frozen. Non-finite timing is rejected when
a definition is prepared, except that component-owned enter/change phases may deliberately use
`iterations: Infinity`; dynamic phases are validated again when resolved. Leave phases always
remain finite. The initial preset entry exports `fade`, `scale`, `pop`, `slideUp`, `slideDown`,
`slideLeft`, and `slideRight`.

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
frame. Infinite effects are rejected by this finite helper. When reduced motion is active, an
explicit `reduced` phase runs; without one, the visual work completes immediately while the same
logical state transition and structural settlement continue.

Looping enter/change phases are detached from their causal task's structural settlement but remain
owned by `MotionElement`. Leave, Activity parking, target replacement, and component disposal
cancel them. A looping enter does not block `Presence` in-out sequencing.

An enter phase runs automatically when a root is introduced by a later reactive update. Initial
client rendering and hydration adoption skip enter by default; `appear` opts those generations in.
Release reversal retains the original generation but runs enter as a continuation from the
interrupted computed frame rather than resetting to its authored first keyframe.

The main runtime uses a browser-safe Web Animations driver by default, so bundled attributed and
explicit motion works without requiring a separate plugin host. Creating that driver does not read
browser globals, and playback completes immediately when an element has no `animate()` capability,
so importing the main package, definitions, or presets remains server-safe. The client plugin entry
installs the same driver through an application-owned lease. `@exactjs/motion/testing` provides a
deterministic injected driver whose playbacks settle only when the test advances them. Application
driver installations are leases: nested or overlapping application lifetimes restore the latest
still-active driver even when they dispose out of order.

## Presence and keyed collections

`Presence` makes removed content semantically absent while its finite leave work settles. It moves
focus to an optional return target, applies `inert` and disables pointer interaction, and restores
the same connected DOM generation when presence reverses before leave completion:

```tsx
<Presence when={this.state.showDialog} returnFocus={this.ref.openButton} mode="out-in">
	<Motion as="dialog" motion={dialogMotion}>
		<DialogContents />
	</Motion>
</Presence>
```

The renderer publishes release while observers can attach leave tasks, then deactivates the
retained functional subtree. Reversal cancels those stale descendants and reactivates the same
component and DOM generation. Any active enter or change playback is canceled before leave starts;
ordinary Activity parking also cancels visual work without manufacturing a leave phase.
The browser driver snapshots properties controlled by interrupted playback before cancellation and
uses that transient frame as the start of the reversal; authored destination styles remain
authoritative and no animation fill is retained.

The default `mode="sync"` reconciles keyed replacements together. `mode="out-in"` waits for old
keyed ranges and their leave work to settle before mounting replacements. `mode="in-out"` commits
new keyed ranges first, waits for their descendant enter playbacks to settle, then releases the
previous ranges. If reduced-motion policy skips enter—or no enter phase applies—the same state
machine advances immediately. Rapid changes remain generation fenced, so an out-in reversal can
restore retained keyed DOM instead of creating a second copy.

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

## Coordinated publication

`createViewTransitionCoordinator()` implements the neutral
`@exactjs/core/framework/publication` contract. Pass it to `createExactRouter()` to publish an
accepted navigation exactly once inside the native View Transition update callback:

```ts
const publication = createViewTransitionCoordinator({
	name: (request) => (request.kind === 'navigation' ? 'route' : undefined)
});

const router = createExactRouter({ source, routes, publication });
```

The update callback awaits the framework commit's `rendered` receipt, while visual completion
remains immediate, nonblocking task work. Unsupported browsers and reduced-motion policy publish
immediately through the same contract. An already aborted request publishes zero times.

## Plugin-owned JSX

The shared compiler and DOM renderer carry grouped motion markers, resolve targets through native
component output, merge nearest props, and mount `MotionElement` as an ordinary transparent
component. An attributed `@exactjs/motion` import is recorded independently of build policy. Vite
includes the reached capability in its bundle-local catalog and supplies it to DOM, hydration, and
SSR entry points. Applications can therefore use either namespaced `motion:*` attributes or the
explicit compilerless `Motion` component.
