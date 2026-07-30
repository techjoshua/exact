# Optional motion component library

## Status

Proposed. `@exactjs/motion` does not exist yet.

The structured task-tree prerequisites are implemented in `@exactjs/core`:
opaque frame capture, atomic reservations, synchronous frame restoration,
cancelable framework executions, descendant settlement, semantic frame kinds
and labels, and structural finalizers that remain part of their parent's
settlement. The motion package, publication coordinator, renderer behavior,
tooling presentation, and sample migrations described here remain future work.

This proposal depends on the current contracts in:

- [`../tasks.md`](../tasks.md);
- [`../jsx-cells.md`](../jsx-cells.md);
- [`../scheduling-suspense-activity.md`](../scheduling-suspense-activity.md);
- [`../ssr-hydration.md`](../ssr-hydration.md); and
- [`unified-function-defined-tasks.md`](unified-function-defined-tasks.md).

## Decision summary

eXact should provide an optional DOM motion library rather than embed animation
policy into the component runtime. Motion uses the existing task tree as its
lifetime and coordination model:

- `Motion` animates one explicitly rendered intrinsic element.
- `Presence` retains a conditional range until its attached leave tree settles.
- `MotionList` owns a keyed retained projection for leave and reorder motion.
- `LayoutGroup` coordinates layout measurement and shared layout identity.
- `MotionConfig` supplies reduced-motion and package-wide defaults.
- Web Animations is the primary browser driver.
- animations are immediate, nonblocking, and structurally attached by default;
- infinite animations are detached but remain component-owned;
- cancellation and rapid reversal use `TaskFrameExecution.cancel()`;
- no public transition token, presence promise collection, DOM commit token, or
  second lifetime hierarchy is introduced; and
- router integration uses a neutral publication-coordination contract from
  `@exactjs/core`, so router and motion never depend on one another.

## Goals

1. Make enter, update, leave, layout, reorder, and route motion feel native to
   setup-once eXact components.
2. Preserve component and DOM identity during leave and rapid reversal.
3. Attach all finite motion to the task that causally produced the DOM change.
4. Keep application state authoritative and inspectable.
5. Make cancellation, cleanup, reduced motion, SSR, and hydration deterministic.
6. Allow compilerless libraries and adapters to produce the same behavior
   through shared JavaScript functions.
7. Keep the package optional and removable without changing component state
   architecture.
8. Integrate with the router through dependency inversion rather than package
   imports in either direction.

## Non-goals

- Reimplementing CSS layout, a physics engine, or a general timeline editor.
- Requiring a virtual DOM or repeated component execution.
- Providing React-compatible `motion.div` factories or Hooks.
- Animating arbitrary removed JSX without an explicit `Presence` or
  `MotionList` owner in the first release.
- Treating native View Transitions as the presence implementation.
- Serializing in-progress animation state through SSR.
- Keeping infinite animation structurally attached to an interaction.
- Making authored animation keyframes or easing curves compiler syntax.

## Design principles

### State remains the source of truth

Motion affects how committed state becomes visible; it does not create a
parallel application state store. A leaving child is semantically absent as
soon as application state removes it. `Presence` retains only the physical
range and component ownership necessary to finish leave work.

### Tasks own time

Animations, animation-frame callbacks, observers, and delayed removal are
time-bearing resources. They belong to task frames and component ownership.
The package must not introduce an unrelated transition controller whose
settlement and cancellation can disagree with the task tree.

### The DOM stays renderer-owned

Components may retain a range by continuing to render it, but the motion
package must not remove renderer-owned nodes behind the renderer's back.
Final presence removal updates the retained projection; the renderer performs
the physical removal through its ordinary keyed-range machinery.

### Native APIs are drivers, not architecture

Web Animations, `ResizeObserver`, `MutationObserver`,
`prefers-reduced-motion`, and View Transitions are useful browser mechanisms.
They do not define component identity, task ownership, readiness, or routing.

## Package and environment boundary

The package is published as `@exactjs/motion`.

Its main component surface is isomorphic:

- browser rendering installs the Web Animations driver and observers;
- SSR renders the final semantic element without animation state;
- hydration adopts existing DOM before optional `appear` motion;
- non-DOM renderers may use the semantic no-op driver or reject DOM-specific
  imperative helpers; and
- browser globals are isolated in driver modules so importing the package on a
  server does not access `window`, `document`, or `Element`.

The expected package dependencies are:

| Package             | Runtime dependencies                                   |
| ------------------- | ------------------------------------------------------ |
| `@exactjs/motion`   | `@exactjs/core`                                        |
| `@exactjs/router`   | `@exactjs/core`, `@exactjs/request`                    |
| application         | whichever optional libraries it chooses                |
| development/testing | `@exactjs/dom`, `@exactjs/jsx`, and `@exactjs/testing` |

Motion does not import `@exactjs/router`. Router does not import
`@exactjs/motion`.

## Proposed public surface

```ts
export {
	LayoutGroup,
	Motion,
	MotionConfig,
	MotionList,
	Presence,
	animate,
	defineMotion
} from '@exactjs/motion';

export type {
	LayoutGroupProps,
	MotionDefinition,
	MotionEffect,
	MotionPhase,
	MotionPlayback,
	MotionProps,
	MotionReducedPolicy,
	MotionTransition,
	PresenceProps
} from '@exactjs/motion';
```

### Motion definitions

The package should preserve Web Animations vocabulary rather than create an
incompatible timeline language:

```ts
export type MotionEffect = Readonly<{
	keyframes: Keyframe[] | PropertyIndexedKeyframes;
	options?: KeyframeAnimationOptions;
}>;

export type MotionPhaseContext = Readonly<{
	phase: 'enter' | 'change' | 'leave';
	element: Element;
	reducedMotion: boolean;
}>;

export type MotionPhase =
	| MotionEffect
	| ((context: MotionPhaseContext) => MotionEffect | undefined);

export type MotionDefinition = Readonly<{
	enter?: MotionPhase;
	change?: MotionPhase;
	leave?: MotionPhase;
	reduced?: MotionPhase | 'skip';
}>;

export function defineMotion(definition: MotionDefinition): MotionDefinition;
```

`defineMotion()` freezes and validates a reusable definition. It is ordinary
JavaScript and does not require the eXact compiler.

```ts
const dialogMotion = defineMotion({
	enter: {
		keyframes: [
			{ opacity: 0, transform: 'translateY(8px) scale(.98)' },
			{ opacity: 1, transform: 'none' }
		],
		options: { duration: 180, easing: 'ease-out' }
	},
	leave: {
		keyframes: [
			{ opacity: 1, transform: 'none' },
			{ opacity: 0, transform: 'translateY(6px) scale(.98)' }
		],
		options: { duration: 130, easing: 'ease-in' }
	}
});
```

Animation fill is transient. Final visual state must come from the element's
authored attributes and styles rather than an indefinitely retained animation
effect. The runtime removes the finished effect after the underlying committed
style represents the destination.

### `Motion`

`Motion` renders one real intrinsic element selected by `as`. It does not clone
an arbitrary child or create `motion.div` factories:

```tsx
<Motion as="section" motion={dialogMotion} layout className="dialog">
	<DialogContents />
</Motion>
```

The proposed props are conceptually:

```ts
export type MotionProps<Tag extends keyof JSX.IntrinsicElements> = Readonly<{
	as: Tag;
	motion?: MotionDefinition;
	enter?: MotionPhase;
	change?: MotionPhase;
	leave?: MotionPhase;
	appear?: boolean;
	layout?: boolean | 'position' | 'size';
	layoutId?: string;
	children?: Child;
}> &
	Omit<JSX.IntrinsicElements[Tag], 'children'>;
```

Direct `enter`, `change`, and `leave` props override the corresponding reusable
definition phase. Intrinsic props retain their normal typing.

`Motion` owns:

- its element ref;
- the active finite animation execution;
- detached looping playback;
- layout measurements;
- observers; and
- cleanup registered against its durable component instance.

It never recreates those resources because a parent updates.

### Low-level `animate`

Libraries that already own an element may use a task-aware imperative helper:

```ts
export interface MotionPlayback extends PromiseLike<void> {
	readonly signal: AbortSignal;
	cancel(reason?: unknown): void;
}

export function animate(element: Element, effect: MotionEffect): MotionPlayback;
```

`animate()` opens an immediate, nonblocking motion frame under the ambient task
when one exists. Its implementation uses the framework task-frame ABI; callers
do not receive or manipulate a raw `TaskFrameToken`.

## Scheduling and task semantics

Finite visual work defaults to:

```ts
{
	priority: 'immediate',
	readiness: 'nonblocking',
	detached: false
}
```

These dimensions remain independent:

- **Immediate** means the animation is scheduled before ordinary and deferred
  work so visual feedback starts promptly.
- **Nonblocking** means Suspense and navigation readiness do not wait before
  publishing already usable content.
- **Structurally attached** means an observer that awaits the initiating task
  still observes motion and final removal as descendants of that task.

An infinite animation cannot structurally settle. `Motion` marks looping
playback detached and owns it with the component. Leaving or disposing the
component cancels the loop before finite leave work settles.

The expected tree is:

```text
interaction or reactive task
└── renderer consequence
    └── presence-leave [immediate, nonblocking]
        ├── motion-leave: dialog
        ├── motion-leave: backdrop
        └── nested descendant motion
```

## Presence

`Presence` owns a stable conditional range:

```tsx
<Presence when={this.state.showDialog} returnFocus={this.ref.openButton}>
	<Motion as="dialog" motion={dialogMotion}>
		<DialogContents />
	</Motion>
</Presence>
```

The state machine is:

```text
absent -> entering -> present -> leaving -> absent
                     ^             |
                     +-------------+
                        reversal
```

On removal, `Presence`:

1. records a new leave generation;
2. keeps the previous range in its retained projection;
3. moves focus out of the range when necessary;
4. makes the range inert and removes it from accessibility navigation;
5. opens a `presence-leave` task frame under the causal task;
6. publishes the leaving phase so descendant `Motion` components participate;
7. lets descendant animations and observers attach automatically;
8. removes the retained projection only after a fulfilled structural
   finalizer; and
9. reports errors through the component error boundary.

The core operation is:

```ts
const leave = runTaskFrame(
	{
		parent: captureTaskFrame(),
		kind: 'presence-leave',
		label: 'Leave dialog',
		priority: 'immediate',
		readiness: 'nonblocking'
	},
	{
		work: () => publishLeavingRange(),
		afterChildren(outcome) {
			if (outcome.status === 'fulfilled' && generationIsCurrent()) {
				publishAbsentRange();
			}
		}
	}
);
```

If presence returns before leave settles:

```ts
leave.cancel('presence-restored');
```

Cancellation aborts every attached descendant, waits for cleanup, reports a
cancelled outcome, and prevents stale removal. The next enter animation begins
from the element's current computed visual state rather than resetting it to
the original enter keyframe.

`Presence` must not require application code to collect animation promises or
call `Promise.all()`.

### Focus and semantic absence

A leaving range remains physically present but is semantically absent:

- set `inert` where supported;
- disable pointer interaction;
- exclude the range from accessibility navigation;
- avoid placing `aria-hidden` on an element that still contains focus;
- move focus to `returnFocus` before semantic removal; and
- provide a deterministic fallback when the supplied target is unavailable.

The package must test keyboard and screen-reader-facing behavior independently
from visual timing.

## Motion lists

An ordinary keyed map cannot animate a removed entry because application state
no longer contains it. `MotionList` owns a retained projection without taking
ownership of application data:

```tsx
<MotionList items={this.state.cards} getKey={(card) => card.id} exitLayout="pop">
	{(card) => (
		<Motion as="article" layoutId={card.id} layout motion={cardMotion}>
			<Card card={card} />
		</Motion>
	)}
</MotionList>
```

It supports:

- stable key identity;
- enter and finite leave;
- FLIP reorder motion;
- removal retention;
- rapid reinsertion and cancellation;
- nested presence;
- duplicate-key diagnostics; and
- `exitLayout="retain" | "pop"`.

The retained record contains the key, last value, phase, generation, and range
identity. It is not a second mutable application collection.

## Layout and shared identity

`LayoutGroup` coordinates measurements:

```tsx
<LayoutGroup id="shipping-results">
	<MotionList items={this.state.providers} getKey={(item) => item.providerId}>
		{(provider) => (
			<Motion as="article" layout layoutId={provider.providerId}>
				<ProviderCard provider={provider} />
			</Motion>
		)}
	</MotionList>
</LayoutGroup>
```

Each participant retains its previous committed rectangle. After a relevant
DOM update it measures the new rectangle, applies the inverse visual transform,
and animates to identity. `MotionList` can snapshot before publishing its keyed
projection, providing the most precise reorder path. General descendants use
element refs, mutation observation, resize observation, and animation-frame
scheduling.

The first release supports shared `layoutId` only while source and destination
coexist under one `LayoutGroup`. Cross-route shared elements use the optional
View Transition coordinator described below.

Layout and authored transforms are independent motion channels. The
implementation should use additive Web Animation composition where supported.
When safe composition is unavailable, it must either use position-only layout
motion or issue a development diagnostic rather than silently overwriting an
authored transform.

## Reduced motion

```tsx
<MotionConfig reducedMotion="system">
	<App />
</MotionConfig>
```

```ts
export type MotionReducedPolicy = 'system' | 'always' | 'never';
```

- `system` follows `prefers-reduced-motion`;
- `always` uses the reduced phase or completes immediately; and
- `never` runs the ordinary phase.

The default is `system`. When no reduced phase exists, finite motion completes
immediately while preserving the same task and finalizer ordering. Reduced
motion must not use a different presence lifetime.

## SSR and hydration

- SSR emits final semantic DOM and never emits a leaving phase.
- Motion definitions and browser animation handles are not serialized.
- Hydration adopts the existing element before installing observers.
- Enter motion does not replay after hydration by default.
- `appear` opts into one post-hydration entrance.
- Reduced-motion policy is resolved before `appear`.
- A hydration mismatch is recovered by the renderer's existing range recovery,
  not by motion-specific DOM replacement.

## Router integration without dependency coupling

Router and motion need to coordinate only the publication boundary: the router
prepares data and owns navigation, while motion may delay or visually wrap the
single synchronous commit that publishes the new route.

Neither library should import the other. A neutral contract belongs in an
explicit framework subpath:

```ts
// @exactjs/core/framework/publication
export interface FrameworkPublicationRequest<Metadata = unknown> {
	readonly kind: string;
	readonly signal: AbortSignal;
	readonly metadata: Metadata;
	publish(): void;
}

export interface FrameworkPublicationCoordinator<Metadata = unknown> {
	publish(request: FrameworkPublicationRequest<Metadata>): void | PromiseLike<void>;
}
```

The dependency direction is:

| Consumer          | Imports                                                  |
| ----------------- | -------------------------------------------------------- |
| `@exactjs/router` | the neutral coordinator type from `@exactjs/core`        |
| `@exactjs/motion` | the same neutral type and task-frame functions from core |
| application       | both optional libraries and composes the capability      |
| router package    | never imports motion                                     |
| motion package    | never imports router                                     |

The router defines its own metadata:

```ts
export interface NavigationPublicationMetadata {
	readonly historyAction: 'POP' | 'PUSH' | 'REPLACE';
	readonly from: RouteLocation;
	readonly to: RouteLocation;
	readonly transitionId: number;
}

export interface CreateExactRouterOptions<Route extends ExactRouteDefinition> {
	// existing options...
	readonly publication?: FrameworkPublicationCoordinator<NavigationPublicationMetadata>;
}
```

After loaders and blockers succeed, the router calls the coordinator around
only the authoritative publication:

```ts
await publication.publish({
	kind: 'navigation',
	signal: operation.abort.signal,
	metadata: {
		historyAction: action,
		from: snapshot.location,
		to: nextLocation,
		transitionId: currentTransition
	},
	publish() {
		source.push(target, options.state, options.status);
		snapshot = buildSnapshot(action);
		notify();
	}
});
```

Without a coordinator, the router uses an identity coordinator that calls
`publish()` synchronously. Router behavior therefore does not depend on motion
being installed.

Motion provides a generic coordinator factory:

```ts
const publication = createViewTransitionCoordinator({
	name(request) {
		return request.kind === 'navigation' ? 'route' : undefined;
	}
});

const router = createExactRouter({
	source,
	routes,
	publication
});
```

`createViewTransitionCoordinator()` is generic over metadata. It does not
import `NavigationPublicationMetadata`; applications that want route-specific
classification receive that type from the router and configure the generic
coordinator themselves.

When `document.startViewTransition` is available, the coordinator:

1. opens an immediate, nonblocking `view-transition` frame under the active
   navigation task;
2. invokes `request.publish()` exactly once in the native update callback;
3. resolves the coordinator call once publication is complete;
4. retains the native transition's visual completion as attached child work;
5. forwards cancellation from `request.signal`;
6. applies reduced-motion policy; and
7. falls back to immediate publication when unsupported.

This separates navigation readiness from visual settlement: route data and DOM
may publish without waiting for animation, while the initiating task tree still
contains the transition until it settles.

The coordinator contract is also usable by future non-router publishers. It
must remain synchronous-publication-oriented, transport-neutral, and free of
route types.

## Compiler and language tools

No new application syntax or compiler lowering is required for the initial
package. Components, refs, props, context, and task-aware runtime helpers are
ordinary supported eXact constructs.

The compiler must:

- preserve normal intrinsic prop typing through `Motion`;
- avoid moving browser-driver imports into server artifacts;
- retain component and range identity through `Presence` and `MotionList`; and
- apply existing task-frame propagation to reactive renderer consequences.

Language tools may later add package-aware explanations such as “retained by
presence leave,” but should not add source badges to every element. Existing
task diagnostics and semantic tokens remain authoritative.

## DevTools

The runtime records semantic frame `kind` separately from the human label.
Motion uses bounded values such as:

- `presence-enter`;
- `presence-leave`;
- `motion-enter`;
- `motion-change`;
- `motion-leave`;
- `layout-transition`; and
- `view-transition`.

The task tree shows the initiating task, parentage, priority, readiness,
generation, cancellation reason, and structural settlement. Tooling must not
retain raw elements, animation objects, keyframes, callbacks, or task-frame
tokens in inspection snapshots.

## Testing

Protection should match the stateful and timing-sensitive boundary.

### Deterministic package tests

`@exactjs/motion/testing` should provide an injected animation driver and
clock. Tests cover:

- enter, change, leave, and reduced completion;
- exact cleanup and finalizer ordering;
- cancellation before foreground completion;
- cancellation while descendants settle;
- rapid leave/enter reversal;
- stale-generation fencing;
- nested presence;
- detached-loop disposal;
- duplicate list keys;
- list removal and reinsertion;
- reorder measurements; and
- observer teardown.

### DOM integration tests

Use the real eXact DOM renderer to verify:

- node and component identity remain stable;
- physical removal follows structural settlement;
- a parent task waits through the presence finalizer;
- authored styles survive animation cleanup;
- layout animation does not overwrite unrelated transforms;
- focus leaves inert content safely; and
- reduced motion preserves lifecycle ordering.

### Browser tests

Run representative Web Animations, ResizeObserver, focus, hydration, and View
Transition tests in real Chromium. Browser tests should assert semantic states
and final DOM rather than pixel-perfect intermediate frames unless a visual
regression is the contract being protected.

### Router contract tests

Use a fake `FrameworkPublicationCoordinator` to prove:

- publication occurs exactly once;
- loaders finish before publication;
- stale navigation cannot publish;
- cancellation reaches the coordinator;
- absence of a coordinator preserves current behavior; and
- motion and router packages can be built and tested independently.

## Documentation and samples

Implementation must add:

- `component-libraries/motion/README.md`;
- `component-libraries/motion/AGENTS.md`;
- a current `docs/motion.md` reference;
- a public docs-app motion guide with navigation and search metadata;
- package API examples for presence, lists, layout, reduced motion, and
  imperative animation;
- router documentation for the neutral publication option;
- DevTools documentation for motion frame kinds; and
- reusable eXact agent-skill guidance that directs agents to the installed
  motion package's `AGENTS.md`.

Sample adoption should be incremental:

1. Kanban demonstrates keyed reorder, removal, reinsertion, and focus.
2. Shipping Calculator demonstrates result-card presence and loading changes.
3. The docs application demonstrates optional route View Transitions.
4. Workbench demonstrates panel presence and reduced-motion configuration.

Samples remain understandable without motion. Removing the package should
remove animation, not require rewriting application state.

## Delivery plan

### Phase 1: package foundation

- Create the package, README, agent guidance, contracts, context, and browser
  driver boundary.
- Implement `defineMotion()`, `MotionConfig`, `animate()`, and finite owned
  playback.
- Add deterministic driver tests.

### Phase 2: element and presence motion

- Implement `Motion` with explicit intrinsic elements.
- Implement `Presence`, semantic absence, focus transfer, structural
  finalization, and reversal.
- Add DOM identity and cancellation integration tests.

### Phase 3: keyed collections and layout

- Implement `MotionList`, retained keyed records, reorder FLIP, and
  reinsertion.
- Implement `LayoutGroup`, layout channels, shared identity, and transform
  conflict diagnostics.

### Phase 4: SSR, hydration, and accessibility

- Add server no-op rendering, hydration adoption, `appear`, reduced motion,
  focus behavior, and browser tests.

### Phase 5: neutral publication and router opt-in

- Add `@exactjs/core/framework/publication`.
- Add the optional coordinator field to `@exactjs/router`.
- Add `createViewTransitionCoordinator()` to motion.
- Verify independent package builds and fallback behavior.

### Phase 6: tooling, docs, and samples

- Add motion task presentation to DevTools.
- Publish the current reference and docs-app guide.
- Update agent guidance and package checks.
- Adopt motion in the selected samples.

## Acceptance criteria

The proposal is complete when:

1. no motion lifetime exists outside component ownership and the task tree;
2. cancelling a leave aborts all descendants and never removes a restored
   range;
3. parent structural settlement includes final presence removal;
4. reduced motion preserves the same logical state transitions;
5. SSR and hydration never flash a leaving or initial state by default;
6. list identity survives reorder, removal, and rapid reinsertion;
7. router and motion have no dependency on one another;
8. navigation works unchanged when no coordinator is supplied;
9. compilerless libraries can use the public JavaScript helpers;
10. DevTools shows motion under its causal task without exposing live
    resources; and
11. package, DOM, browser, router, SSR, hydration, and documentation checks
    pass at the risk-appropriate layers.
