# Exploratory motion values and orchestration

## Status

**Exploratory. Not ready for API selection or implementation as one feature.** The low-risk prepared
motion additions may be promoted into focused implementation work independently. Reactive motion
values, durable ownership, gesture handoff, timelines, and cross-root shared elements require
prototype evidence and separate acceptance decisions.

This document does not select `this.own()` or any other general component-resource API. Introducing
a core lifetime primitive solely to make a motion API look concise would be the wrong direction.

## Question

Which missing motion and interaction capabilities can eXact add while preserving these properties?

- application state remains the semantic source of truth;
- each mounted component retains one compiled state-machine instance;
- renderer-owned DOM identity is not replaced by a shadow visual tree;
- finite visual work participates in task cancellation and structural settlement;
- gestures recognize input without becoming a second application-state store;
- reduced-motion policy changes the visual path, not application behavior; and
- optional motion can still be removed without breaking markup, events, focus, or accessibility.

The reference capabilities under investigation are finite enter/leave/change transitions, spring
and tween values, momentum-preserving direct manipulation, keyed reorder animation, crossfade,
shared-element transitions, staggered orchestration, and scroll/view timelines.

## Current baseline

`@exactjs/motion` already provides:

- prepared `enter`, `change`, `leave`, and reduced phases;
- attributed `motion:*` composition and an explicit `Motion` component;
- Web Animations playback owned by nonblocking framework task frames;
- cancellation, release reversal, `Activity` handling, and reduced-motion settlement;
- `Presence` with sync, out-in, and in-out keyed replacement;
- `MotionList`, stable keyed identity, exit-layout pop, and additive FLIP;
- `LayoutGroup` and shared `layoutId` measurement;
- native View Transition publication coordination; and
- a deterministic injectable test driver.

`@exactjs/gestures` already provides press, hover/focus, long press, drag, pan, pinch, keyboard
movement, velocity samples, threshold arbitration, bounded async callback delivery, cancellation,
and owned listener cleanup.

The current packages therefore already cover most structural transition and recognition behavior.
The clearest missing capability is a first-class finite or continuously settling value between an
application-owned target and a visual projection.

## Goals

- Identify inexpensive additions that fit the current prepared-definition and WAAPI contracts.
- Explore spring and tween values without prematurely adding a core ownership API.
- Define a neutral handoff between gestures and motion without a package dependency cycle.
- Reuse task trees, renderer generations, layout identity, publication, and inspection.
- Prefer native CSS, WAAPI, Scroll Timelines, and View Transitions where they satisfy the contract.
- Keep every proposed convenience removable when its authored semantic fallback remains complete.

## Non-goals

- Selecting `this.own()` in this proposal.
- Adding a React-style hook, render-loop animator, component rerender loop, or hidden store.
- Making animation frames authoritative application state.
- Coupling the base motion and gesture packages directly to each other.
- Building a general physics engine inside motion; `@exactjs/physics` remains the owner of sustained
  simulation and collision behavior.
- Replacing CSS pseudo-classes, scroll-driven animations, or native View Transitions with
  JavaScript when the platform already supplies the needed behavior.
- Promising cross-document or untrusted-microfrontend shared-element transitions before identity,
  trust, and snapshot containment are proven.

## Track A: low-risk prepared motion additions

This track requires no new component ownership primitive and is the likely first implementation
slice.

### Finite spring timing

Add a pure helper that converts bounded spring parameters into a finite prepared timing curve or
sampled keyframes:

```ts
const settle = springTiming({
	stiffness: 170,
	damping: 22,
	mass: 1,
	precision: 0.001,
	maxDuration: 800
});

export const pop = defineMotion({
	enter: {
		keyframes: [
			{ opacity: 0, transform: 'scale(.94)' },
			{ opacity: 1, transform: 'none' }
		],
		options: settle
	}
});
```

The helper is deterministic and side-effect free. It rejects non-finite parameters, caps duration
and sample count, records its approximation tolerance, and produces ordinary validated
`MotionEffect` data. Browsers that support an equivalent `linear()` timing function may use it;
other drivers receive bounded sampled keyframes. Reduced-motion policy continues to resolve through
the existing motion definition.

This gives enter, leave, change, layout, and gesture-release effects spring character without
creating a durable reactive value.

### Tween and interpolation helpers

Add prepared helpers for duration selection, easing, and finite interpolation:

- standard easing functions and cubic-bezier presets;
- distance-sensitive bounded duration;
- numeric, color, compatible CSS-unit, point, and transform interpolation;
- blur, clip, draw/SVG-path, and crossfade presets; and
- stagger-delay calculation over an explicit stable index and count.

Helpers return data or pure functions accepted by existing motion definitions. They do not install
observers, request animation frames, or retain elements.

### Documentation and enhancement parity

The current runtime already accepts attributed `enter`, `change`, `leave`, `appear`, `layout`, and
`layoutId` roles. Document and test each form directly, including self-closing targets, reduced
motion, SSR fallback, hydration adoption, and capability exclusion. This is an immediate usability
win even without new runtime behavior.

### Prepared transition composition

Explore pure composition helpers over existing definitions:

```ts
const cardMotion = composeMotion(fade, slideUp, withTiming({ duration: 180 }));
```

Composition must have deterministic property-conflict rules, preserve finite validation, and fail
when two phases claim incompatible transforms or timing. It must not introduce parent/child
coordination or implicit DOM lookup.

## Track B: reactive motion values

Svelte-style spring and tween values expose a target, current interpolated value, velocity, and a
completion promise. The capability is valuable for counters, meters, cursors, drag projections,
camera positions, and other visuals that do not map cleanly to one element playback.

A candidate eXact value has this conceptual contract:

```ts
interface MotionValue<T> extends Disposable {
	readonly current: T;
	readonly target: T;
	readonly velocity: T;
	set(value: T, options?: MotionSetOptions): Promise<void>;
	finish(): void;
	cancel(reason?: unknown): void;
}
```

`current` must be a first-class reactive read so existing expression-level updates consume it
without rerendering the component. `target` is visual policy, not a replacement for application
state. A source-bound form may observe `this.state` as its target, but feedback from `current` into
that same source must be rejected or explicitly broken to prevent reactive cycles.

### Unresolved ownership options

No option is accepted yet.

#### Option 1: explicit component owner argument

```tsx
const displayed = spring(this, () => this.state.target, springOptions);
```

This is explicit and requires no new core API, but exposes the component instance to a library and
creates an unusual calling convention.

#### Option 2: general durable resource registration

```tsx
const displayed = this.own(
	spring(
		this.reactive(() => this.state.target),
		springOptions
	)
);
```

This is concise and general, but it overlaps component lifecycle cleanup and task-owned resources.
It should exist only if several unrelated packages demonstrate the same durable-resource need and
the API clearly distinguishes component-lifetime ownership from task-generation ownership.

#### Option 3: explicit structural owner

```tsx
<MotionValue source={this.state.target} spring={springOptions}>
	{(displayed) => <output>{displayed.current}</output>}
</MotionValue>
```

This uses ordinary component ownership and works compilerlessly, but adds structural ceremony and a
child callback for a value that should update expression-level consumers directly.

#### Option 4: task-owned target tracking

```tsx
const displayed = createMotionValue(0);

function followTarget(task: TaskContext = TaskContext.client().latest().nonblocking()) {
	return displayed.set(this.state.target, { signal: task.signal });
}

followTarget();
```

This uses existing task ownership and makes cancellation explicit, but creation and final disposal
of the durable value still need an owner. Requiring authors to spell the task would also be too much
ceremony for ordinary visual interpolation.

#### Option 5: element-local enhancement only

```tsx
<output motion:value={springProjection(() => this.state.target)} />
```

The existing `MotionElement` can own the resource with no core change. This is attractive for style,
attribute, and text projections on one target, but it does not provide a reusable value to several
expressions or non-DOM consumers.

### Prototype questions

Each ownership prototype must measure:

- setup, activation, `Activity`, and disposal behavior;
- source invalidation and latest-wins settlement;
- cancellation during `await value.set()`;
- SSR representation and passive hydration adoption;
- whether current values need serialization or always restart from committed target;
- reduced-motion changes during active settlement;
- one value consumed by several DOM expressions;
- DevTools identity and leak-free inspection; and
- allocation and frame cost versus one native WAAPI animation.

Until one option proves these contracts with acceptable source ergonomics, reactive motion values
remain exploratory.

## Track C: gesture-to-motion handoff

Gesture samples already expose delta and velocity. A neutral optional capability could let a motion
owner consume the accepted gesture session without either package importing the other:

```ts
interface DirectManipulationSink {
	start(sample: GestureSample): void;
	move(sample: GestureSample): void;
	release(sample: GestureSample): Promise<void> | void;
	cancel(reason?: unknown): void;
}
```

The gestures package owns recognition, arbitration, pointer capture, keyboard equivalence, and
session cancellation. Motion owns visual position, constraints, elasticity, inertia, and snap
settlement. Application code owns accepted semantic state such as the selected card, final order, or
chosen snap point.

Candidate prepared policy:

```tsx
const cardDrag = defineDragMotion({
	axis: 'x',
	bounds: { min: -240, max: 240 },
	elastic: 0.15,
	release: inertia({ deceleration: 0.92, snap: [-240, 0, 240] }),
	onCommit: (position) => (this.state.cardPosition = position)
});

<article gesture:drag={cardDrag.gesture} motion:direct={cardDrag.motion}>
	...
</article>;
```

The split surface above is illustrative. A final design should avoid asking the author to manually
pair two halves when build-time capability composition can prove they belong to the same target.
Keyboard movement must reach the same semantic commit path, and reduced motion may remove elastic
overshoot but not remove the interaction.

Open questions include constraint measurement, scroll competition, snap accessibility, server
fallback, and whether continuous projection should use transforms, a motion value, or an
application-supplied projection callback.

## Track D: interaction visual states

Hover, keyboard focus, press, and drag often affect only visual presentation. A neutral
interaction-state context could allow:

```tsx
<button
	gesture:press={pressable}
	motion:hover={hoverLift}
	motion:press={pressedScale}
	motion:focus={focusRing}
>
	Open
</button>
```

This must not duplicate CSS pseudo-classes where CSS is sufficient. It is justified only when a
prepared finite effect, gesture arbitration, or coordinated cancellation is required. Focus and
keyboard press must be equivalent to pointer intent. Motion exclusion must leave the native button
and its authored focus styling accessible.

The accessibility proposal owns focus and modality semantics; motion may consume the neutral state
but must not decide focusability, accessible name, role, or keyboard action.

## Track E: timelines and stagger

Parent/child orchestration is attractive but has unresolved ownership implications:

```tsx
<MotionTimeline sequence={stagger({ each: 40, direction: 'forward' })}>{items}</MotionTimeline>
```

A timeline needs a finite participant set, stable order, readiness rules, cancellation, reduced
motion, and behavior for late, conditional, portal, lazy, and keyed children. It must not inspect
arbitrary runtime `props.children`, mutate VNodes, or depend on private renderer nodes.

Possible implementations are explicit participant context, renderer-owned motion registration, or
the still-exploratory cooperative structured-children capability. No choice is made here. Pure
stagger-delay helpers over an explicit stable index belong to Track A and do not wait for this work.

## Track F: shared elements and crossfade

The current `LayoutGroup` snapshots one scoped participant set and can reuse a `layoutId` snapshot
within a coordinated list publication. Broader shared-element behavior would need to cover
conditional replacement, portals, routes, retained presence generations, independent roots, and
possibly trusted microfrontends.

The preferred driver order is:

1. native View Transitions when one accepted publication owns both states;
2. bounded renderer-coordinated FLIP when both live elements are measurable; and
3. an owned snapshot layer only when containment, focus, privacy, cleanup, and stale-generation
   fencing are proven.

Crossfade must never duplicate interactive semantics: snapshot layers are inert, hidden from the
accessibility tree, and non-interactive. Focus stays with the real destination element. A remote
root participates only through an explicit compatible protocol; matching author strings are not
cross-build authority.

## Track G: scroll and view timelines

Prefer CSS `scroll-timeline`, `view-timeline`, and WAAPI `ScrollTimeline`/`ViewTimeline` when
available. A candidate enhancement may describe a bounded native timeline:

```tsx
<section motion:timeline="view" motion:range="entry 10% cover 40%" motion:apply={reveal}>
	...
</section>
```

Fallback must use one target-owned observer or animation, not a permanent framework-wide scroll
loop. The package validates range syntax, honors reduced motion, pauses with `Activity`, and releases
observers on target replacement. Scroll position is browser state and is not serialized into SSR or
hydration metadata.

## Compiler and language-tool boundary

The standard compiler continues to understand only generic enhancement composition, target routing,
reactive expressions, task ownership, placement, and finite effects. It does not learn spring
equations, easing names, gesture physics, or animation presets.

Package-prepared values and inert capability facts may declare:

- whether an activator is optional or required;
- whether it owns visual-only work;
- whether it needs a browser target, layout measurement, or continuous input; and
- whether it participates in readiness or structural release.

The LSP can display those declared effects and identify conflicting target ownership. It must not
execute motion definitions to preview them during ordinary semantic analysis. A separate explicit
preview command may run trusted application code in the existing preview/test environment.

## Performance and testing questions

Every promoted slice needs evidence for:

- maximum keyframe/sample count and preparation cost;
- zero idle animation-frame work;
- bounded observers and document listeners;
- cancellation and disposal under rapid reversals;
- additive-transform compatibility with authored transforms;
- keyed reorder and focus preservation;
- reduced-motion behavior before and during playback;
- SSR-safe imports and passive hydration;
- deterministic driver tests; and
- browser measurements against equivalent direct WAAPI/CSS behavior.

Reactive motion values additionally need frame-budget, allocation, fan-out, background-tab,
high-refresh-rate, and long-task measurements. A feature that looks smooth in a small demo but
creates one unbounded scheduler per value does not pass.

## Candidate delivery order

1. **Low-risk prepared helpers:** finite spring timing, easing/interpolation helpers, additional
   presets, pure composition, and full documentation of existing enhancement roles.
2. **One ownership prototype:** compare element-local enhancement ownership with one explicit
   durable-value design; do not add a core API yet.
3. **Gesture handoff prototype:** constraints, velocity, inertia, snap, keyboard equivalence, and
   reduced motion on one component-owned target.
4. **Native timeline adapters:** scroll/view timelines and broadened View Transition coordination.
5. **Only after evidence:** select or reject reactive motion values, parent timelines, and
   cross-root shared elements independently.

## Promotion criteria

A track moves into a decision-complete proposal or current motion contract only when:

1. its owner, lifetime, cancellation, activation, SSR, hydration, and reduced-motion semantics are
   explicit;
2. ordinary application state remains authoritative and inspectable;
3. optional exclusion retains semantic and accessible behavior;
4. the design introduces no motion/gesture/accessibility dependency cycle;
5. compiler and package responsibilities remain finite and deterministic;
6. representative source is materially simpler than direct WAAPI/CSS or existing eXact code; and
7. focused correctness and performance evidence justifies the maintenance surface.
