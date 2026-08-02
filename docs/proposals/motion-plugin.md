# Optional motion plugin

## Status

Proposed. `@exactjs/motion` does not exist yet.

The structured task-tree prerequisites are implemented in `@exactjs/core`:
opaque frame capture, atomic reservations, synchronous frame restoration,
cancelable framework executions, descendant settlement, semantic frame kinds
and labels, and structural finalizers that remain part of their parent's
settlement. The plugin-system enhancement markers and ordinary plugin
components, general ref-release lifecycle, motion package, publication coordinator,
tooling presentation, and sample migrations described here remain future work.

This proposal depends on the current contracts in:

- [`../tasks.md`](../tasks.md);
- [`../jsx-cells.md`](../jsx-cells.md);
- [`../scheduling-suspense-activity.md`](../scheduling-suspense-activity.md);
- [`../ssr-hydration.md`](../ssr-hydration.md); and
- [`unified-function-defined-tasks.md`](unified-function-defined-tasks.md).

It also depends on the proposed generic extension contracts in
[`plugin-jsx-renderer-extensions.md`](plugin-jsx-renderer-extensions.md).
It may compose with the independent [`gestures`](gestures-plugin.md),
[`physics`](physics-plugin.md), and [`gravity`](gravity-plugin.md) proposals,
but none is a motion dependency.

## Decision summary

eXact should provide motion as an optional framework plugin rather than embed
animation policy into core or duplicate animation machinery in compiled
components. An attributed import normally binds its canonical export to the
local `motion` prefix, and the plugin component uses the existing task tree as its
lifetime and coordination model:

- `motion:apply={definition}` attaches reusable motion to an intrinsic element
  or a component whose current logical output resolves an intrinsic root.
- `@exactjs/motion/presets` supplies immutable, tree-shakeable definitions for
  common motion such as fades, slides, scales, and pops.
- `motion:enter`, `motion:change`, and `motion:leave` override individual
  phases.
- `motion:appear`, `motion:layout`, and `motion:layout-id` opt into specific
  behavior without creating alternate element types.
- all namespaces on one JSX boundary compile into one grouped reactive marker;
- an active motion entry resolves to an ordinary compiled `MotionElement`
  whose lifecycle is tied to the selected enhancement-target generation;
- conditional and keyed ranges retain removed motion elements through generic
  generation-fenced component-root release;
- `Motion`, `Presence`, and `MotionList` remain explicit compilerless forms
  for libraries and policies that need an authored boundary.
- `LayoutGroup` coordinates layout measurement and shared layout identity.
- `MotionConfig` supplies reduced-motion and package-wide defaults.
- Web Animations is the primary browser driver.
- animations are immediate, nonblocking, and structurally attached by default;
- infinite animations are detached but remain component-owned;
- cancellation and rapid reversal use `TaskFrameExecution.cancel()`;
- no public transition token, retention lease, presence promise collection,
  general DOM commit token, or second lifetime hierarchy is introduced;
- compiling source that uses `motion:*` requires an attributed motion import,
  while executing precompiled source remains functionally renderable when the
  plugin component is inactive;
  and
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
9. Keep compiled motion markers small and renderable without copying the
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
soon as application state removes it. A generation-fenced component-root release or
explicit `Presence` boundary retains only the mounted range and component
ownership necessary to finish leave work.

### Tasks own time

Animations, animation-frame callbacks, observers, and delayed removal are
time-bearing resources. They belong to task frames and component ownership.
The package must not introduce an unrelated transition controller whose
settlement and cancellation can disagree with the task tree.

### The DOM stays renderer-owned

The renderer retains a root generation only while the generic release task
frame settles. Motion never receives a public retention token and never
removes renderer-owned nodes. The frame's generation-fenced structural
finalizer calls the existing unmount-then-remove teardown path.

### Native APIs are drivers, not architecture

Web Animations, `ResizeObserver`, `MutationObserver`,
`prefers-reduced-motion`, and View Transitions are useful browser mechanisms.
They do not define component identity, task ownership, readiness, or routing.

### Compilation and execution are independent

Applications that do not use motion do not install or activate
`@exactjs/motion`. Source files containing `motion:*` import the package's
generated plugin contract with `with { type: 'exact-plugin' }`. Their emitted
generic markers remain functionally renderable when the motion component is
absent or inactive. Explicit motion components, presets, and
imperative helpers remain ordinary JavaScript imports and therefore retain
ordinary package dependencies.

Disabling animation is policy, not missing infrastructure. `MotionConfig` may
disable motion or select reduced motion while preserving the same committed
state, task cleanup, and structural-finalizer ordering.

### Plugins extend bounded framework seams

The attributed motion export supplies a static canonical-prop contract. The
compiler validates the locally imported prefix, strips those canonical props,
and emits one entry in the boundary's grouped marker. That marker travels
through ordinary component output and mounts the ordinary compiled
`MotionElement` at the resolved enhancement target. Motion reuses normal reactive
props, refs, context, tasks, lifecycle, errors, readiness, hydration, and
disposal. Core adds no motion-specific hook; the plugin owns every animation
policy.

## Package and environment boundary

The plugin and its library surface are published together as
`@exactjs/motion`. Its package manifest contributes compiler, render, client,
testing, and configuration-type entries through `@exactjs/plugin-api`.

Its declarative JSX surface is isomorphic:

- the compiler recognizes `motion:*` only when `motion` resolves to an
  attributed exact-plugin import;
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
| Source imports motion with `type: 'exact-plugin'` and uses `motion:*`    | Source validates and emits an optional canonical motion marker.           |
| Source uses an unbound prefix or ordinary import as `motion:*`           | Compilation fails with a prefix/import diagnostic.                        |
| Precompiled marker, trusted plugin component active                      | The boundary mounts an ordinary compiled `MotionElement`.                 |
| Precompiled marker, component absent, ignored, or untrusted              | The target renders unchanged and generic warning policy applies.          |
| SSR host has no active motion component                                  | Final semantic HTML renders from the unchanged child.                     |
| Source imports `Motion`, `Presence`, `animate`, or another runtime value | The generated JavaScript has an ordinary dependency on `@exactjs/motion`. |
| Component package publishes precompiled motion JSX                       | Consumers may execute it without installing or enabling motion.           |

Compiled JSX markers use the generic capability-export, canonical-identity,
wrapper-package, discovery, and trust behavior defined by
[`plugin-jsx-renderer-extensions.md`](plugin-jsx-renderer-extensions.md). Motion
adds no re-export, substitution, compatibility, or runtime-selection rule of its
own. Explicit imports such as presets retain their ordinary JavaScript package
dependency.

## Canonical prop surface

The ordinary authoring form decorates a real intrinsic element:

```tsx
import motion from '@exactjs/motion' with { type: 'exact-plugin' };
import { pop } from '@exactjs/motion/presets';

<section motion:apply={pop} motion:appear motion:layout="position" />;
```

The initial namespace is:

| Attribute                     | Meaning                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| `motion:apply={definition}`   | Accepts a package preset or prepared custom motion definition.           |
| `motion:enter={phase}`        | Overrides the reusable enter phase at this site.                         |
| `motion:change={phase}`       | Overrides the reusable change phase at this site.                        |
| `motion:leave={phase}`        | Overrides the reusable leave phase at this site.                         |
| `motion:appear`               | Allows enter motion after client mount or hydration according to policy. |
| `motion:layout`               | Enables position-and-size layout motion.                                 |
| `motion:layout="position"`    | Animates position changes without claiming size.                         |
| `motion:layout="size"`        | Animates size changes without claiming position.                         |
| `motion:layout-id={identity}` | Joins stable shared-layout identity under a `LayoutGroup`.               |

These are compiler-owned attributes, not DOM attributes. There is no bare
`motion={...}` shorthand. The local `motion` prefix must resolve to the
attributed import; aliases are allowed but do not change canonical identity.
The compiler strips canonical motion props from intrinsic and component props
before emitting one marker.

They apply to intrinsic HTML, SVG, and MathML elements and to native eXact
components. The renderer follows the normal logical tree through components,
fragments, selected Activity/Suspense branches, retained ranges, and portals.
The first active `motion:root` wins; otherwise the first intrinsic encountered
is the fallback. Opaque foreign-runtime boundaries require an adapter contract.

```tsx
function SaveButton(this: Component<{}>, props: { children: Child }) {
	return () => <button className="save">{props.children}</button>;
}

<SaveButton motion:apply={pop} motion:appear>
	Save
</SaveButton>;
```

The outer boundary owns the marker declaration. The renderer carries it through
`SaveButton` and creates `MotionElement` for the resolved `button` root inside
contexts published by intermediate components. `SaveButton` receives none of
the motion props.

The compiler preserves ordinary bindings and motion independently:

```tsx
<div
	style={{ opacity: this.state.enabled ? 1 : 0.5 }}
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
import motion from '@exactjs/motion' with { type: 'exact-plugin' };
import { fade, slideUp } from '@exactjs/motion/presets';

return () => (
	<>
		<div motion:apply={fade}>Saved</div>
		<dialog motion:apply={slideUp}>...</dialog>
	</>
);
```

The `motion:apply` attribute accepts only a prepared `MotionDefinition`. Package
presets are prepared definitions, and application or library authors prepare
their own with `defineMotion()`. This keeps verbose keyframes at reusable
module boundaries instead of inline in component JSX. Phase-specific
attributes remain available for deliberate one-site overrides.

## Plugin component and attributed export

The implementation is compiled normally. Its public props define the canonical
schema; `children` is reserved and does not become a namespaced attribute:

```tsx
export interface MotionElementProps {
	apply?: MotionDefinition;
	enter?: MotionPhase;
	change?: MotionPhase;
	leave?: MotionPhase;
	appear?: boolean;
	layout?: boolean | 'position' | 'size' | 'both';
	layoutId?: string;
	children?: Child;
}
```

The attributed export establishes the capability:

```ts
export { MotionElement as default } from './MotionElement.js'
	with { type: 'exact-plugin' };
```

The compiler derives the prop schema and maps `layoutId` to `layout-id`.
Module resolution derives canonical identity `@exactjs/motion#default`; there
is no authored plugin ID, runtime flag, output declaration, or special
compilation mode.

`MotionElement` is a setup-once eXact component rather than a handler object.
Generic renderer traversal resolves its enhancement target. The ordinary root
lifecycle of the transparent `MotionElement` reports the currently rendered
element, presentation, and generation-fenced release:

```tsx
function MotionElement(this: Component<MotionElementState>, props: MotionElementProps) {
	const root = this.refs.root<Element>();
	const settings = this.getContext(MotionContext);

	async function change(
		element: Element | undefined,
		presented: boolean,
		definition: MotionDefinition | undefined,
		config: MotionSettings,
		task: TaskContext = TaskContext.client().latest().immediate().nonblocking()
	) {
		if (!element || !presented || !definition) return;
		await playDefinition(element, definition, config, task.signal);
	}

	async function leave(
		release: RootRelease<Element> | undefined,
		definition: MotionDefinition | undefined,
		config: MotionSettings,
		task: TaskContext = TaskContext.client().latest().immediate().nonblocking()
	) {
		if (!release || !release.presented || !definition) return;
		await playDefinition(release.target, definition, config, task.signal);
	}

	change(root.current, root.presented, resolveChange(props, settings), settings);
	leave(root.release, resolveLeave(props, settings), settings);

	return () => props.children;
}
```

The calls occur in setup scope and therefore declare inferred initialization
and reactive task activation. Their explicitly supplied prop, context, element,
presentation, and release expressions remain ordinary dependencies; no
non-context parameter default accidentally turns one into a captured input.
Direct task activation from the returned view is a compiler diagnostic. The
component may use state, contexts, tasks, ErrorBoundary behavior,
Suspense/readiness, cleanup, and inspection normally.

The motion instance is tied to the resolved enhancement-target generation, so
target replacement creates a new instance while keyed movement or Activity
parking preserves one whose target survives. Changing only structural output
inside `MotionElement` preserves its ordinary component instance and advances
its component-root lifecycle generation.

The target is never found by querying DOM. Motion chooses transparent output,
but the generic architecture permits structural plugin components. Explicit
`Motion`, `Presence`, `MotionList`, and `LayoutGroup` remain the preferred
authored structural forms.

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

<aside motion:apply={slideUp} />
<output motion:apply={fade} motion:leave={pop.leave} />
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
policy, or trigger conditions. The consuming boundary supplies those through
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
an accidentally recreated inline object from satisfying the `motion:apply`
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

<section motion:apply={accountPanelMotion}>...</section>;
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

`Motion` is the explicit component equivalent of a motion-enhanced intrinsic
boundary. It renders one real intrinsic element selected by `as`; it does not
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

The renderer consequence is shared by the reactive bindings invalidated in
that scheduler wave. It is an ownership envelope, not the presence lifetime:
each `presence-leave` remains a distinct cancelable frame with its own
generation, descendants, and finalizer.

## Presence

A conditional intrinsic root with a leave phase uses the renderer's generic
retained-removal contract:

```tsx
return () =>
	this.state.showDialog ? (
		<dialog motion:apply={dialogMotion}>
			<DialogContents />
		</dialog>
	) : null;
```

The compiler does not need motion-specific conditional lowering. The generic
component-root lifecycle publishes `root.release` while the renderer retains
that root generation. `MotionElement` invokes its leave task with the release
and current definition as explicit arguments. Existing task-child capture joins
the leave work before structural teardown. Without an active motion component,
no leave task exists and removal remains immediate.

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

On removal, generic root release or explicit `Presence`:

1. records a new leave generation;
2. keeps the mounted range connected under existing renderer ownership;
3. deactivates the functional subtree using existing Activity-style
   activation ownership while release observers remain active;
4. moves focus and makes retained content inert under motion policy;
5. publishes each affected `RootRelease` inside the renderer's retained-removal
   consequence frame;
6. lets ordinary function-defined leave tasks attach automatically;
7. waits for those task descendants and cleanup;
8. checks the generation before calling the renderer's existing
   `disposeMounted()` structural finalizer; and
9. reports failures through existing task and component error handling while
   still guaranteeing final removal.

The core operation is:

```ts
const execution = runTaskFrame(
	{
		parent: captureTaskFrame(),
		kind: 'retained-removal',
		label: 'Remove dialog',
		priority: 'immediate',
		readiness: 'nonblocking'
	},
	{
		work() {
			for (const released of releasedRoots) {
				publishRootRelease(released.lifecycle, {
					generation: released.generation,
					reason: 'reconcile-removed',
					target: released.target,
					presented: released.presented
				});
			}
		},
		afterChildren(outcome) {
			if (generationIsCurrent(generation, execution)) {
				disposeMounted(mounted);
			}
		}
	}
);
```

A single-root conditional therefore exposes one release, while a fragment or
named range may release several independent roots. The renderer groups them
under the one structural consequence and waits for their attached descendants;
application and plugin code receive no release array or retention token.

If presence returns before leave settles:

```ts
execution.cancel('release-reversed');
```

The renderer increments the generation before cancellation, clears the
published release, reactivates the existing subtree, and patches the same
mounted identity. Cancellation aborts every attached descendant, waits for
cleanup, reports a cancelled outcome, and prevents stale browser completion
from removing the restored range. The next enter animation begins from the
element's current computed visual state rather than resetting it to the
original enter keyframe.

There is no component-facing retention token or manual release completion. A
plugin component with no applicable leave phase starts no child task. Root
shutdown cancels the task frame and runs immediate existing teardown. Rejected
motion is reported through ordinary error handling, while the structural
finalizer still guarantees removal. The framework adds no universal timeout;
motion definitions must remain abortable and bounded, and DevTools reports
long-running release frames.

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
A motion-decorated keyed root can therefore enter a retained-removal task frame
from its existing mounted record:

```tsx
{
	this.state.cards.map((card) => (
		<article key={card.id} motion:apply={cardMotion} motion:layout motion:layout-id={card.id}>
			<Card card={card} />
		</article>
	));
}
```

Application state remains authoritative: the removed card is logically absent
immediately, while the renderer temporarily retains only its mounted range and
last committed boundary inputs. Reinsertion with the same key cancels the
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

Each participant retains its last rectangle. `ResizeObserver`, cached geometry,
and a following animation frame provide localized change measurements without
adding generic plugin before/after-update hooks. `MotionList` and `LayoutGroup`
snapshot their owned participants before publishing a coordinated keyed
projection, providing the precise reorder path without pretending the current
eager DOM renderer has a global planned commit. Arbitrary FLIP coordination
across independently updated roots is deferred until measurement proves a
renderer transaction facility is warranted.

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

`MotionConfig` is an ordinary context-producing component. A page or subtree can override
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
Unspecified values inherit. With no `MotionConfig`, motion uses package defaults.
The context uses ordinary eXact reactivity.

`MotionElement` and explicit motion components read the nearest context from
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
- An inactive motion enhancement leaves the target unchanged and emits the same
  final DOM.
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
	publish(): FrameworkPublicationCommit;
}

export interface FrameworkPublicationCommit {
	/** Settles after the reactive renderer consequences caused by publication commit. */
	readonly rendered: PromiseLike<void>;
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
only the authoritative publication. `publish()` performs the router's current
source mutation, `sourceRevision` guard, subscription-source behavior, request
source behavior, snapshot settlement, and notification exactly once; the
following is intentionally abbreviated rather than a replacement algorithm:

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
		return publishAcceptedNavigationUsingCurrentSourceRules(action, target, operation, revision);
	}
});
```

Without a coordinator, the router uses an identity coordinator that calls
`publish()` synchronously and awaits its `rendered` receipt only where the
caller requires committed DOM. Router behavior therefore does not depend on
motion being installed. The receipt is a narrow framework publication barrier,
not a component-facing DOM commit token or a general plugin update hook.

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
3. awaits `commit.rendered` inside that callback so the browser captures the
   DOM after eXact's reactive consequence flush;
4. resolves the coordinator call once publication is complete;
5. retains the native transition's visual completion as attached child work;
6. forwards cancellation from `request.signal`;
7. applies reduced-motion policy; and
8. falls back to immediate publication when unsupported.

This separates navigation readiness from visual settlement: route data and DOM
may publish without waiting for animation, while the initiating task tree still
contains the transition until it settles.

The coordinator contract is also usable by future non-router publishers. An
accepted, current request publishes once; a stale or aborted request publishes
zero times. The contract remains synchronous-publication-oriented,
transport-neutral, and free of route types.

## Compilation and dependency boundary

Compiling source containing `motion:*` requires `motion` to resolve to an
attributed import with `with { type: 'exact-plugin' }`. The generic plugin
proposal's uniquely resolved export-path rule selects the canonical attributed
`MotionElement` export edge and contributes canonical props and diagnostics
without executing plugin code or shipping the animation driver.

Conceptually:

```tsx
import motion from '@exactjs/motion' with { type: 'exact-plugin' };

<article motion:apply={cardMotion} motion:layout="position" />;
```

joins the boundary's conceptual grouped marker:

```ts
createEnhancementBoundary(
	{
		'@exactjs/motion#default': {
			apply: reactiveSlot(cardMotion),
			layout: reactiveSlot('position')
		}
	},
	createCompiledVNode('article', ordinaryProps)
);
```

The actual marker and boundary are compact, opaque compiler/renderer data.
Generated JSX does not import a motion runtime. Resolution uses canonical
module-plus-export identity; the local import alias never selects an active
component.

The dependency distinctions are intentional:

1. source compilation requires the attributed exact-plugin import and its
   static generated contract;
2. consuming a compiled motion marker requires only the generic core boundary
   and remains functional without an active motion component;
3. the final application bundle links the exact canonical component into its generated catalog;
4. explicit JavaScript imports such as `Motion`, `Presence`, `defineMotion`,
   or `animate` create normal package dependencies; and
5. a package exposing TSX source retains the attributed import for recompilers,
   while a precompiled package records only canonical marker provenance and
   does not forward a required motion runtime.

The compiler emits this bundle metadata without a plugin registry. The final
application either bundles the motion package capability or does not; package
inclusion is the activation trust boundary. Unavailable server identities warn
once per host, and unavailable client identities warn once per client runtime.
The underlying target remains unchanged in every inactive case.

The compiler must:

- recognize `motion:*` only when `motion` resolves lexically to the attributed
  exact-plugin import;
- reject bare `motion={...}` while accepting only statically finite namespaced
  keys from spreads;
- preserve normal intrinsic typing and ordinary reactive bindings;
- forward only canonical `MotionElementProps`, leaving ordinary undeclared
  attributes as component type errors;
- resolve direct enhancement targets statically where possible and otherwise
  use the generic explicit-target-first logical-tree traversal;
- strip every motion member from intrinsic and component props, group all of
  them into one motion entry inside the grouped marker with other capabilities
  at that site;
- transfer the authored key to the boundary without changing child component
  identity;
- emit source, range, key, and hydration identity without source text;
- avoid browser-driver imports in server and client output alike;
- reuse generic component-root lifecycle and release participation;
- preserve existing conditional and keyed range lowering rather than replacing
  it with motion-specific structures; and
- stamp canonical module and attributed-export identity from resolution rather
  than the local prefix or plugin-returned data; and
- project provenance through existing build and inspection products without an
  enhancement-specific protocol version.

Language tools use the same TypeScript module resolution and attributed-export analysis as compilation. They
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
- reactive context updates without recreating `MotionElement` instances;
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
- attributed re-export validation, local prefix aliases, canonical prop
  derivation, and erased compile-only imports;
- unbound prefixes, ordinary imports, open spread key spaces, and invalid
  canonical prop schemas fail during compilation;
- ordinary reactive props and motion expressions retain independent
  dependencies;
- attributes do not leak into intrinsic or component props, and markers
  do not import the motion runtime;
- emitted markers retain canonical module-plus-export identity and source-site
  provenance regardless of activation;
- another package imported under the local prefix `motion` cannot claim these
  canonical markers;
- active, ignored, absent, and untrusted identities produce the expected
  enhanced, silent passthrough, or warn-once behavior;
- named preset imports tree-shake independently and do not activate browser
  code during server import;
- optional host capability metadata remains intact; and
- source compiled without the attributed plugin import fails deterministically.

### DOM integration tests

Use the real eXact DOM renderer to verify:

- intrinsic and nested component target resolution follows explicit-root-first
  traversal and preserves keyed logical identity;
- `MotionElement` is created for the resolved enhancement target inside
  contexts published by every intermediate component and is recreated when
  that target is replaced;
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
- the native update callback awaits the framework publication's `rendered`
  receipt;
- subscription-backed and request-backed sources retain their existing
  `sourceRevision`, snapshot, and notification behavior;
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

- Implement stable generic refs and element-root lifecycle/release first, then attributed
  plugin exports/imports, canonical prop derivation, grouped markers, ordinary
  plugin components, logical target resolution, enhancement-target-bound identity, and trust
  behavior
  described in
  [`plugin-jsx-renderer-extensions.md`](plugin-jsx-renderer-extensions.md).
- Prove compiler-only requirements and active, ignored, absent, untrusted,
  context-ordered, and cyclic behavior.
- Add root-scoped browser registry generation, language-tools, and test-host
  support.

### Phase 2: plugin and library foundation

- Create the package, README, agent guidance, contracts, context, and browser
  driver boundary.
- Implement the attributed `MotionElement` re-export and generated static
  plugin contract; declare render, client, testing, and configuration entries.
- Implement `defineMotion()`, `MotionConfig`, `animate()`, and finite owned
  playback.
- Publish the side-effect-free common preset subpath and verify per-preset
  tree shaking.
- Add deterministic driver tests.

### Phase 3: JSX element and presence motion

- Implement `motion:apply`, phase overrides, `motion:appear`, and transparent
  `MotionElement` activation on intrinsic elements and nested components using
  generic logical enhancement-target resolution.
- Implement `Motion` with explicit intrinsic elements.
- Implement generation-fenced `RootRelease`, `Presence`, semantic absence, focus
  transfer, structural finalization, and reversal.
- Add DOM identity and cancellation integration tests.

### Phase 4: keyed collections and layout

- Implement ordinary motion components on compiler-lowered keyed
  range roots.
- Implement `MotionList`, retained keyed records, reorder FLIP, and
  reinsertion.
- Implement `LayoutGroup`, layout channels, shared identity, and transform
  conflict diagnostics.

### Phase 5: SSR, hydration, and accessibility

- Add server no-op rendering, hydration adoption, `appear`, reduced motion,
  focus behavior, and browser tests.
- Verify server, client, and testing behavior for active, ignored, absent, and
  untrusted enhancements.

### Phase 6: neutral publication and router opt-in

- Add `@exactjs/core/framework/publication`.
- Add the optional coordinator field to `@exactjs/router`.
- Add `createViewTransitionCoordinator()` to motion.
- Verify independent package builds and unsupported-browser publication
  fallback behavior.

### Phase 7: tooling, docs, and samples

- Add `motion:*` completion, hover, diagnostics, and semantic entities.
- Add motion task, enhancement instance, component-root generation, and release
  presentation to DevTools.
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
    component supplies inherited policy;
11. generated JSX-only code uses the generic grouped-marker ABI rather than the
    motion runtime and does not duplicate the driver;
12. missing, ordinary, or incompatible attributed plugin imports fail
    deterministically;
13. precompiled motion JSX remains functional when the plugin component is
    inactive;
14. markers retain canonical attributed-export identity and only a trusted
    exact registration can activate them;
15. intrinsic elements and nested native components share generic root
    resolution without receiving canonical motion props as ordinary props;
16. DevTools shows motion under its causal task without exposing live
    resources; and
17. `motion:apply={...}` accepts shipped presets and custom `defineMotion()` results,
    common preset imports are independently tree-shakeable, and ordinary JSX
    does not require inline keyframes; and
18. package, compiler, plugin-host, DOM, browser, router, SSR, hydration, and
    documentation checks
    pass at the risk-appropriate layers.
