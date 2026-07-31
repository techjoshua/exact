# Optional motion plugin

## Status

Proposed. `@exactjs/motion` does not exist yet.

The structured task-tree prerequisites are implemented in `@exactjs/core`:
opaque frame capture, atomic reservations, synchronous frame restoration,
cancelable framework executions, descendant settlement, semantic frame kinds
and labels, and structural finalizers that remain part of their parent's
settlement. The plugin-system JSX and renderer extensions, motion package,
publication coordinator, renderer behavior, tooling presentation, and sample
migrations described here remain future work.

This proposal depends on the current contracts in:

- [`../tasks.md`](../tasks.md);
- [`../jsx-cells.md`](../jsx-cells.md);
- [`../scheduling-suspense-activity.md`](../scheduling-suspense-activity.md);
- [`../ssr-hydration.md`](../ssr-hydration.md); and
- [`unified-function-defined-tasks.md`](unified-function-defined-tasks.md).

It also depends on the proposed generic extension contracts in
[`plugin-jsx-renderer-extensions.md`](plugin-jsx-renderer-extensions.md).

## Decision summary

eXact should provide motion as an optional framework plugin rather than embed
animation policy into core or duplicate animation machinery in compiled
components. The plugin owns the `motion` JSX namespace and uses the existing
task tree as its lifetime and coordination model:

- `motion={definition}` attaches reusable motion to an intrinsic element.
- `@exactjs/motion/presets` supplies immutable, tree-shakeable definitions for
  common motion such as fades, slides, scales, and pops.
- `motion:enter`, `motion:change`, and `motion:leave` override individual
  phases.
- `motion:appear`, `motion:layout`, and `motion:layout-id` opt into specific
  behavior without creating alternate element types.
- conditional and keyed ranges retain removed motion elements through generic
  renderer directive hooks;
- `Motion`, `Presence`, and `MotionList` remain explicit compilerless forms
  for libraries and policies that need an authored boundary.
- `LayoutGroup` coordinates layout measurement and shared layout identity.
- `MotionConfig` supplies reduced-motion and package-wide defaults.
- Web Animations is the primary browser driver.
- animations are immediate, nonblocking, and structurally attached by default;
- infinite animations are detached but remain component-owned;
- cancellation and rapid reversal use `TaskFrameExecution.cancel()`;
- no public transition token, presence promise collection, DOM commit token, or
  second lifetime hierarchy is introduced; and
- component packages that use motion depend on and forward the motion plugin,
  while applications with no motion dependency pay no motion cost; and
- router integration uses a neutral publication-coordination contract from
  `@exactjs/core`, so router and motion never depend on one another.

## Goals

1. Make enter, update, leave, layout, reorder, and route motion feel native to
   ordinary setup-once eXact JSX.
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
9. Keep compiled motion descriptors small and renderable without copying the
   motion engine into each component.
10. Let pages and subtrees override motion policy through ordinary reactive
    component context.

## Non-goals

- Reimplementing CSS layout, a physics engine, or a general timeline editor.
- Requiring a virtual DOM or repeated component execution.
- Providing React-compatible `motion.div` factories or Hooks.
- Adding motion-specific conditionals, lists, animation drivers, or task
  semantics to `@exactjs/core`.
- Allowing plugins to perform unrestricted source or AST rewrites.
- Treating native View Transitions as the presence implementation.
- Serializing in-progress animation state through SSR.
- Keeping infinite animation structurally attached to an interaction.
- Making authored animation keyframes or easing curves compiler syntax.

## Design principles

### State remains the source of truth

Motion affects how committed state becomes visible; it does not create a
parallel application state store. A leaving child is semantically absent as
soon as application state removes it. A directive removal lease or explicit
`Presence` boundary retains only the physical range and component ownership
necessary to finish leave work.

### Tasks own time

Animations, animation-frame callbacks, observers, and delayed removal are
time-bearing resources. They belong to task frames and component ownership.
The package must not introduce an unrelated transition controller whose
settlement and cancellation can disagree with the task tree.

### The DOM stays renderer-owned

The motion directive may ask the renderer to retain a range through a generic
removal lease, but it must not remove renderer-owned nodes behind the
renderer's back. Final presence removal releases the lease; the renderer
performs physical removal through its ordinary keyed-range machinery.

### Native APIs are drivers, not architecture

Web Animations, `ResizeObserver`, `MutationObserver`,
`prefers-reduced-motion`, and View Transitions are useful browser mechanisms.
They do not define component identity, task ownership, readiness, or routing.

### Optionality belongs at the package boundary

Applications that do not use motion do not install or activate
`@exactjs/motion`. Source and component packages that use `motion:*`, explicit
motion components, or imperative helpers declare and forward the motion plugin
as a required dependency. Missing or incompatible support fails during host
preparation rather than silently changing a motion-enabled component.

Disabling animation is policy, not missing infrastructure. `MotionConfig` may
disable motion or select reduced motion while preserving the same committed
state, task cleanup, and structural-finalizer ordering.

### Plugins extend bounded framework seams

The motion compiler extension validates and transports structured JSX
directives. It does not receive an unrestricted compiler AST transform. The
render and client extensions implement motion through generic element, commit,
layout, removal, hydration, and disposal hooks. Core owns those seams and task
frames; the plugin owns every animation policy.

## Package and environment boundary

The plugin and its library surface are published together as
`@exactjs/motion`. Its package manifest contributes compiler, render, client,
testing, and configuration-type entries through `@exactjs/plugin-api`.

Its declarative JSX surface is isomorphic:

- the compiler extension recognizes `motion` namespaced attributes only when
  the plugin is configured;
- browser rendering installs the Web Animations driver and observers when the
  runtime plugin is active;
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

### Activation and dependency matrix

| Situation                                                                | Result                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Source uses `motion:*`, compiler plugin configured                       | Source validates and emits a required motion descriptor.                  |
| Source uses `motion:*`, compiler plugin absent                           | Compilation fails with an unknown JSX directive namespace diagnostic.     |
| Precompiled descriptor, compatible runtime plugin active                 | Motion participates in renderer lifecycle and task ownership.             |
| Precompiled descriptor, runtime plugin absent or incompatible            | Host preparation fails before rendering.                                  |
| SSR host loads the motion render projection                              | Final semantic HTML renders without browser animation state.              |
| Source imports `Motion`, `Presence`, `animate`, or another runtime value | The generated JavaScript has an ordinary dependency on `@exactjs/motion`. |
| Component package authors motion                                         | It depends on and forwards `@exactjs/motion` as a required plugin.        |

Compiled JSX descriptors use a generic helper from `@exactjs/core`; they do not
statically import the motion runtime. Consequently the animation driver is
installed once per application rather than copied into every component. The
package dependency and plugin-forwarding declaration, not a generated static
runtime import, make the capability available to consuming hosts.

A motion-enabled component package declares the dependency normally and
forwards its plugin requirement:

```json
{
	"dependencies": {
		"@exactjs/motion": "^0.1.0"
	},
	"exact": {
		"forwarding": {
			"schemaVersion": 1,
			"include": {
				"@exactjs/motion": {
					"required": true
				}
			}
		}
	}
}
```

A library that wants a motion-free base may expose a separate motion entry.
The motion entry owns this dependency rather than asking the same compiled
component to operate with a missing plugin.

## JSX directive surface

The ordinary authoring form decorates a real intrinsic element:

```tsx
import { pop } from '@exactjs/motion/presets';

<section motion={pop} motion:appear motion:layout="position" />;
```

The initial namespace is:

| Attribute                     | Meaning                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| `motion={definition}`         | Accepts a package preset or prepared custom motion definition.           |
| `motion:enter={phase}`        | Overrides the reusable enter phase at this site.                         |
| `motion:change={phase}`       | Overrides the reusable change phase at this site.                        |
| `motion:leave={phase}`        | Overrides the reusable leave phase at this site.                         |
| `motion:appear`               | Allows enter motion after client mount or hydration according to policy. |
| `motion:layout`               | Enables position-and-size layout motion.                                 |
| `motion:layout="position"`    | Animates position changes without claiming size.                         |
| `motion:layout="size"`        | Animates size changes without claiming position.                         |
| `motion:layout-id={identity}` | Joins stable shared-layout identity under a `LayoutGroup`.               |

These are compiler directives, not DOM attributes. They apply initially to
intrinsic HTML, SVG, and MathML elements. Applying them to a component is a
diagnostic because a component may render no element or several ranges and
must choose explicitly where motion belongs.

The compiler preserves ordinary bindings and motion independently:

```tsx
<div
	style:opacity={this.state.enabled ? 1 : 0.5}
	motion:change={{
		keyframes: [{ opacity: 0.5 }, { opacity: 1 }],
		options: { duration: 120 }
	}}
/>
```

The style binding remains authoritative for the destination. Motion observes
the renderer commit and controls only the visual path. Finished effects are
removed after the authored style represents the destination.

Motion definitions should normally be immutable module-level values. Reactive
phase or identity expressions remain ordinary compiler-observed expressions,
but the language tools should warn when recreating definitions would restart
motion unintentionally.

Everyday source should normally use a preset:

```tsx
import { fade, slideUp } from '@exactjs/motion/presets';

return () => (
	<>
		<div motion={fade}>Saved</div>
		<dialog motion={slideUp}>...</dialog>
	</>
);
```

The `motion` attribute accepts only a prepared `MotionDefinition`. Package
presets are prepared definitions, and application or library authors prepare
their own with `defineMotion()`. This keeps verbose keyframes at reusable
module boundaries instead of inline in component JSX. Phase-specific
attributes remain available for deliberate one-site overrides.

## Library and adapter surface

The package also exposes explicit components and JavaScript helpers. They are
the compilerless surface for external libraries and the place for policies that
cannot be inferred from one decorated element.

```ts
export {
	LayoutGroup,
	Motion,
	MotionConfig,
	MotionContext,
	MotionList,
	Presence,
	animate,
	defineMotion
} from '@exactjs/motion';

export type {
	LayoutGroupProps,
	MotionDefinition,
	MotionDefinitionInput,
	MotionEffect,
	MotionPhase,
	MotionPlayback,
	MotionSettings,
	MotionProps,
	MotionReducedPolicy,
	MotionTransition,
	PresenceProps
} from '@exactjs/motion';
```

Common prepared values use a side-effect-free subpath:

```ts
export {
	fade,
	pop,
	scale,
	slideDown,
	slideLeft,
	slideRight,
	slideUp
} from '@exactjs/motion/presets';
```

Named exports allow bundlers to retain only the presets an application uses.
Importing a preset does not install the motion plugin, touch browser globals,
or allocate an animation driver.

### Presets

Presets are ordinary immutable `MotionDefinition` values. They provide
keyframes and sensible phase defaults while inheriting duration and easing
from the nearest `MotionConfig` when those options are not intrinsic to the
effect:

```tsx
import { fade, pop, slideUp } from '@exactjs/motion/presets';

<aside motion={slideUp} />
<output motion={fade} motion:leave={pop.leave} />
```

The initial preset set should remain small and unsurprising:

| Preset                     | Intended behavior                                    |
| -------------------------- | ---------------------------------------------------- |
| `fade`                     | Opacity enter and leave.                             |
| `scale`                    | Subtle scale enter and leave.                        |
| `pop`                      | Combined opacity and scale for dialogs and overlays. |
| `slideUp` / `slideDown`    | Block-axis translation plus opacity.                 |
| `slideLeft` / `slideRight` | Inline translation plus opacity.                     |

Presets do not own application state, presence, layout identity, duration
policy, or trigger conditions. The consuming directive supplies those through
its normal element identity, surrounding `Presence` or keyed range, and
`MotionConfig`.

Preset names and keyframes are public visual contracts. Changes that
materially alter their direction, distance, or reduced-motion behavior require
normal compatibility treatment rather than silently changing every consuming
interface.

### Motion definitions

The package should preserve Web Animations vocabulary rather than create an
incompatible timeline language:

```ts
declare const preparedMotionDefinition: unique symbol;

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

export type MotionDefinitionInput = Readonly<{
	enter?: MotionPhase;
	change?: MotionPhase;
	leave?: MotionPhase;
	reduced?: MotionPhase | 'skip';
}>;

export type MotionDefinition = MotionDefinitionInput &
	Readonly<{ [preparedMotionDefinition]: true }>;

export function defineMotion(definition: MotionDefinitionInput): MotionDefinition;
```

`defineMotion()` freezes and validates a reusable definition. It is ordinary
JavaScript and does not require the eXact compiler. The private brand prevents
an accidentally recreated inline object from satisfying the `motion`
attribute while leaving phase-specific override attributes structurally
authorable.

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

Prepared definitions remain plain read-only data apart from their package
brand. They may be exported by application modules or component libraries:

```ts
// account-motion.ts
export const accountPanelMotion = defineMotion({
	enter: {
		keyframes: [
			{ opacity: 0, transform: 'translateY(8px)' },
			{ opacity: 1, transform: 'none' }
		]
	},
	leave: {
		keyframes: [
			{ opacity: 1, transform: 'none' },
			{ opacity: 0, transform: 'translateY(8px)' }
		]
	},
	reduced: 'skip'
});
```

```tsx
import { accountPanelMotion } from './account-motion.js';

<section motion={accountPanelMotion}>...</section>;
```

An authored phase option overrides the corresponding preset or custom phase.
Animation options resolve in this order:

1. the site-specific `motion:enter`, `motion:change`, or `motion:leave`;
2. the selected prepared definition;
3. the nearest `MotionConfig`; and
4. package defaults.

Resolution produces a fresh internal playback description without mutating
the prepared definition.

Animation fill is transient. Final visual state must come from the element's
authored attributes and styles rather than an indefinitely retained animation
effect. The runtime removes the finished effect after the underlying committed
style represents the destination.

### `Motion`

`Motion` is the explicit component equivalent of an intrinsic motion
directive. It renders one real intrinsic element selected by `as`; it does not
clone an arbitrary child or create `motion.div` factories:

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

A conditional intrinsic root with a leave phase uses the renderer's generic
retained-removal contract:

```tsx
return () =>
	this.state.showDialog ? (
		<dialog motion={dialogMotion}>
			<DialogContents />
		</dialog>
	) : null;
```

The compiler does not need motion-specific conditional lowering. The mounted
dialog retains its optional directive descriptor. When the renderer is about
to remove the existing range, the active motion directive acquires a generic
removal lease and releases it after the attached leave tree settles. Without
the runtime plugin, no directive claims the lease and removal is immediate.

`Presence` remains the explicit boundary for policies that do not belong to
one element, including focus return, named ranges, sibling fragments,
`out-in`/`in-out` sequencing, and compilerless callers:

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

On removal, the directive handler or explicit `Presence` boundary:

1. records a new leave generation;
2. keeps the previous range in its retained projection;
3. moves focus out of the range when an explicit policy requires it;
4. makes retained content inert and removes it from accessibility navigation;
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

Neither form requires application code to collect animation promises or call
`Promise.all()`.

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

A compiler-lowered keyed map already gives the renderer stable range identity.
A motion-decorated keyed root can therefore acquire a removal lease from its
existing mounted record:

```tsx
{
	this.state.cards.map((card) => (
		<article key={card.id} motion={cardMotion} motion:layout motion:layout-id={card.id}>
			<Card card={card} />
		</article>
	));
}
```

Application state remains authoritative: the removed card is logically absent
immediately, while the renderer temporarily retains only its mounted range and
last committed directive inputs. Reinsertion with the same key cancels the
stale leave generation and reuses identity when safe.

`MotionList` remains the explicit compilerless form and supports additional
collection-wide policies without taking ownership of application data:

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

## Motion configuration context

```tsx
<MotionConfig reducedMotion="system" transition={{ duration: 180, easing: 'ease-out' }}>
	<App />
</MotionConfig>
```

`MotionConfig` is an ordinary context provider. A page or subtree can override
only the values it needs:

```tsx
<MotionConfig transition={{ duration: 80 }}>
	<FastToolbar />
</MotionConfig>
```

The package owns one reactive context:

```ts
export type MotionReducedPolicy = 'system' | 'always' | 'never';

export interface MotionSettings {
	readonly enabled: boolean;
	readonly reducedMotion: MotionReducedPolicy;
	readonly transition: MotionTransition;
	readonly appear: boolean;
}

export const MotionContext: ContextToken<MotionSettings>;
```

`MotionConfig` reads the nearest `MotionContext`, merges its explicitly defined
props, publishes the result with `this.setContext()`, and returns its children.
Unspecified values inherit. With no provider, motion uses package defaults.
The context uses ordinary eXact reactivity.

Motion directives and explicit motion components read the nearest context from
their logical component ancestry. Portalled elements inherit from the component
tree that owns them, not from their physical DOM destination. Direct
element-phase options override context values; context values override package
defaults.

- `enabled: false` completes finite motion immediately while preserving task,
  cleanup, and structural-finalizer ordering.
- `system` follows `prefers-reduced-motion`;
- `always` uses the reduced phase or completes immediately; and
- `never` runs the ordinary phase.

The default reduced-motion policy is `system`. Reduced motion does not create a
different presence lifetime or ownership model.

## SSR and hydration

- SSR emits final semantic DOM and never emits a leaving phase.
- The required motion render projection is a semantic no-op for browser
  animation and emits the same final DOM.
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

## Compilation and dependency boundary

Compiling source containing `motion:*` requires the configured motion compiler
extension. The extension contributes the namespace schema, diagnostics, and
opaque descriptor payload through the constrained plugin API. It does not ship
the animation driver in generated code and does not receive an unrestricted
AST transformation callback.

Conceptually:

```tsx
<article motion={cardMotion} motion:layout="position" />
```

lowers to the equivalent of:

```ts
createCompiledVNode(
	'article',
	ordinaryProps,
	exactDirective('motion', {
		protocol: motionDirectiveProtocol,
		site: motionSite,
		values: {
			default: cardMotion,
			layout: 'position'
		}
	})
);
```

The actual descriptor is compact and opaque. `exactDirective()` belongs to a
generic core/compiler ABI. Generated code does not import
`@exactjs/motion/runtime`; the active render/client plugin claims the
descriptor by namespace and protocol.

The dependency distinctions are intentional:

1. source compilation requires the compiler extension;
2. consuming a compiled motion descriptor requires a compatible runtime
   capability in each relevant host;
3. the package supplies a semantic server projection and browser client
   projection through the same plugin protocol;
4. explicit JavaScript imports such as `Motion`, `Presence`, `defineMotion`,
   or `animate` create normal package dependencies; and
5. a motion-enabled component package declares and forwards the plugin
   dependency even when its generated descriptor uses only the generic core
   ABI.

The plugin registry tracks build-time syntax ownership and required
host-specific runtime capabilities. Missing or incompatible declarations fail
during host preparation rather than at the first render.

The compiler must:

- recognize `motion` only when one configured plugin owns that namespace;
- preserve normal intrinsic typing and ordinary reactive bindings;
- reject the namespace on components until a component-range contract exists;
- emit stable source, range, key, and hydration identity without source text;
- avoid browser-driver imports in server and client output alike;
- record the client activation and renderer lifecycle phases required by each
  directive member;
- preserve existing conditional and keyed range lowering rather than replacing
  it with motion-specific structures; and
- record enough protocol metadata for deterministic compatibility checks and
  cache invalidation.

Language tools load the same prepared plugin registry as compilation. They
provide completion, hover, validation, source-site explanations, and semantic
entities for owned namespaced attributes. They should explain relevant motion
at the decorated element or retained range without covering ordinary
TypeScript hover information or adding a badge to every descendant.

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

- every shipped preset's enter, leave, and reduced-motion contract;
- preset immutability, stable identity, and option inheritance;
- custom prepared definitions and site-specific phase overrides;
- enter, change, leave, and reduced completion;
- exact cleanup and finalizer ordering;
- cancellation before foreground completion;
- cancellation while descendants settle;
- rapid leave/enter reversal;
- stale-generation fencing;
- nested presence;
- nearest `MotionConfig` inheritance and subtree overrides;
- reactive context updates without recreating mounted directives;
- logical context inheritance through portals;
- disabled motion preserving task and finalizer ordering;
- detached-loop disposal;
- duplicate list keys;
- list removal and reinsertion;
- reorder measurements; and
- observer teardown.

### Compiler and plugin-host tests

Use the generic extension conformance suite plus motion-specific fixtures to
verify:

- every declared `motion:*` member, value form, target restriction, and
  diagnostic;
- ordinary reactive props and motion expressions retain independent
  dependencies;
- descriptors do not leak into DOM props or import the motion runtime;
- named preset imports tree-shake independently and do not activate browser
  code during server import;
- host-specific required capability metadata remains intact;
- source compiled without the extension fails deterministically; and
- a missing or incompatible runtime projection fails before rendering.

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

- `plugins/motion/README.md`;
- `plugins/motion/AGENTS.md`;
- a current `docs/motion.md` reference;
- a public docs-app motion guide with navigation and search metadata;
- package API examples for presence, lists, layout, reduced motion, and
  imperative animation;
- a preset gallery and a custom prepared-definition example;
- router documentation for the neutral publication option;
- DevTools documentation for motion frame kinds; and
- reusable eXact agent-skill guidance that directs agents to the installed
  motion package's `AGENTS.md`.

Sample adoption should be incremental:

1. Kanban demonstrates keyed reorder, removal, reinsertion, and focus.
2. Shipping Calculator demonstrates result-card presence and loading changes.
3. The docs application demonstrates optional route View Transitions.
4. Workbench demonstrates panel presence and reduced-motion configuration.

Samples remain understandable when their motion attributes and package
dependency are removed; doing so must not require rewriting application state.

## Delivery plan

### Phase 1: generic plugin prerequisites

- Implement the constrained JSX directive and renderer extension contracts
  described in
  [`plugin-jsx-renderer-extensions.md`](plugin-jsx-renderer-extensions.md).
- Prove required host capability discovery, projection, and early failure.
- Add registry compatibility, language-tools, and test-host support.

### Phase 2: plugin and library foundation

- Create the package, README, agent guidance, contracts, context, and browser
  driver boundary.
- Declare compiler, render, client, testing, and configuration-type plugin
  entries and claim the `motion` namespace.
- Implement `defineMotion()`, `MotionConfig`, `animate()`, and finite owned
  playback.
- Publish the side-effect-free common preset subpath and verify per-preset
  tree shaking.
- Add deterministic driver tests.

### Phase 3: JSX element and presence motion

- Implement `motion`, phase overrides, `motion:appear`, and descriptor
  activation on intrinsic elements.
- Implement `Motion` with explicit intrinsic elements.
- Implement generic removal-lease participation, `Presence`, semantic absence,
  focus transfer, structural finalization, and reversal.
- Add DOM identity and cancellation integration tests.

### Phase 4: keyed collections and layout

- Implement motion directives on compiler-lowered keyed range roots.
- Implement `MotionList`, retained keyed records, reorder FLIP, and
  reinsertion.
- Implement `LayoutGroup`, layout channels, shared identity, and transform
  conflict diagnostics.

### Phase 5: SSR, hydration, and accessibility

- Add server no-op rendering, hydration adoption, `appear`, reduced motion,
  focus behavior, and browser tests.
- Verify compatible server, client, and testing projections and fail early when
  a required host projection is missing.

### Phase 6: neutral publication and router opt-in

- Add `@exactjs/core/framework/publication`.
- Add the optional coordinator field to `@exactjs/router`.
- Add `createViewTransitionCoordinator()` to motion.
- Verify independent package builds and unsupported-browser publication
  fallback behavior.

### Phase 7: tooling, docs, and samples

- Add `motion:*` completion, hover, diagnostics, and semantic entities.
- Add motion task and directive presentation to DevTools.
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
10. `MotionConfig` uses one reactive context whose nearest page or subtree
    provider supplies inherited policy;
11. generated JSX-only code imports the generic directive ABI rather than the
    motion runtime and does not duplicate the driver;
12. missing or conflicting compiler namespace ownership fails deterministically;
13. motion-enabled component packages depend on and forward the plugin, and a
    missing required host projection fails during preparation;
14. DevTools shows motion under its causal task without exposing live
    resources; and
15. `motion={...}` accepts shipped presets and custom `defineMotion()` results,
    common preset imports are independently tree-shakeable, and ordinary JSX
    does not require inline keyframes; and
16. package, compiler, plugin-host, DOM, browser, router, SSR, hydration, and
    documentation checks
    pass at the risk-appropriate layers.
