# Optional gestures plugin

## Status

Implemented. `@exactjs/gestures` provides immutable prepared press, hover, drag, pan, pinch, and
keyboard definitions; deterministic priority arbitration; bounded move delivery; component-owned
cancelable sessions; transparent attributed enhancement activation; inherited policy; presets;
and a deterministic testing clock. Optional cross-package convenience adapters remain deferred and
the base package has no dependency on motion, physics, or gravity.

This proposal depends on the ordinary plugin-component enhancement ABI in
[`plugin-jsx-renderer-extensions.md`](plugin-jsx-renderer-extensions.md). It
uses the current eXact event, component, context, ownership, cancellation,
task, SSR, hydration, and inspection behavior. It does not require
[`motion`](motion-plugin.md), [`physics`](physics-plugin.md), or
[`gravity`](gravity-plugin.md).

## Decision summary

Gestures should be a separate package that recognizes user intent without
owning animation or physical simulation:

- an attributed import from `@exactjs/gestures` supplies the file-local
  `gesture:*` prefix while canonical identity derives from its attributed
  export;
- every gesture value is a package preset or a prepared custom definition;
- all enhancement namespaces at one JSX boundary compile into one grouped,
  reactive marker;
- an active gesture entry creates an ordinary `GestureElement` instance tied
  to the resolved enhancement-target generation;
- the target is resolved during the renderer's normal logical-tree traversal,
  never by querying DOM;
- pointer, touch, mouse, keyboard, and accessibility behavior belong to the
  gesture definition and browser driver;
- recognizer callbacks execute under ordinary eXact interaction/task
  ownership and receive the current cancellation signal;
- gesture sessions are component-owned resources with deterministic cleanup;
- the package can update ordinary component state or invoke application
  callbacks with neither motion nor physics installed; and
- optional adapter subpaths may compose gesture samples with other packages
  without making the base packages depend on each other.

Enhancements are optional by framework contract. An inactive gesture entry
renders its underlying target unchanged. Applications that require gesture
behavior for functional controls must use the explicit `GestureElement` or a
component-library control so the dependency is ordinary and visible.

## Responsibilities and boundaries

Gestures owns:

- event normalization and pointer capture;
- recognition thresholds, direction locking, and competing recognizers;
- semantic session phases and velocity sampling;
- touch-action and selection policy;
- keyboard-equivalent interaction where the gesture represents a control;
- cancellation, lost capture, window blur, and target deactivation;
- gesture inspection and deterministic test input; and
- delivery of semantic callbacks or samples to application code.

Gestures does not own:

- tweening, enter/leave, or layout animation;
- spring integration, collisions, forces, mass, or gravity;
- application data or a hidden mutable store;
- arbitrary global document listeners outside an active owned session;
- DOM removal or range retention; or
- a second event, task, context, lifecycle, or reactive system.

This boundary permits four useful configurations:

| Installed packages                    | Result                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| gestures only                         | semantic input updates ordinary state or calls callbacks                            |
| gestures + motion                     | gesture state selects motion definitions or playback                                |
| gestures + physics                    | drag samples drive a physical body and release velocity                             |
| gestures + physics + gravity + motion | direct manipulation, inertial release, forces, and polished visual presence compose |

## JSX surface

The common form uses one prepared definition:

```tsx
import gesture from '@exactjs/gestures' with { type: 'exact-plugin' };
import { draggable } from '@exactjs/gestures/presets';

<article gesture:apply={draggable} />;
```

The initial schema is:

| Attribute                      | Meaning                                                           |
| ------------------------------ | ----------------------------------------------------------------- |
| `gesture:apply={definition}`   | Applies a prepared definition containing one or more recognizers. |
| `gesture:press={recognizer}`   | Adds or overrides press behavior.                                 |
| `gesture:hover={recognizer}`   | Adds or overrides hover/focus-visible behavior.                   |
| `gesture:drag={recognizer}`    | Adds or overrides drag behavior.                                  |
| `gesture:pan={recognizer}`     | Adds or overrides free pan behavior.                              |
| `gesture:pinch={recognizer}`   | Adds or overrides two-pointer scale/rotation behavior.            |
| `gesture:disabled={condition}` | Reactively disables recognition and cancels an active session.    |

Specific members are deliberate overrides, not separate runtime wrappers. The
compiler groups them into the gesture entry of the boundary's single marker,
and `GestureElement` receives ordinary typed reactive props.

Presets cover policy, not application effects:

```ts
export {
	draggable,
	hoverable,
	longPress,
	pannable,
	pinchable,
	pressable
} from '@exactjs/gestures/presets';
```

Application behavior is supplied by preparing a stable definition during
component setup or at module scope:

```ts
export interface GestureDefinition {
	readonly [gestureDefinitionBrand]: true;
}

export function defineGesture(input: GestureDefinitionInput): GestureDefinition;
```

Inline object literals are rejected for `gesture:apply` so a reactive update
cannot accidentally recreate recognizers. Individual override members accept
prepared recognizers for the same reason.

## Ordinary plugin component and attributed export

The canonical props are the ordinary component props:

```tsx
export interface GestureElementProps {
	apply?: GestureDefinition;
	press?: PressRecognizer;
	hover?: HoverRecognizer;
	drag?: DragRecognizer;
	pan?: PanRecognizer;
	pinch?: PinchRecognizer;
	disabled?: boolean;
	children?: Child;
}
```

The implementation is ordinary eXact code:

```tsx
function GestureElement(this: Component<GestureElementState>, props: GestureElementProps) {
	const root = this.refs.root<Element>();
	const settings = this.getContext(GestureContext);
	const session = createGestureSession();
	this.onUnmount(() => session[Symbol.dispose]());

	function reconcile(
		element: Element | undefined,
		presented: boolean,
		definition: GestureDefinition | undefined,
		disabled: boolean,
		settings: GestureSettings,
		task: TaskContext = TaskContext.client().latest().immediate().nonblocking()
	) {
		session.configure({ element, presented, definition, disabled, settings }, task.signal);
	}

	reconcile(root.current, root.presented, resolveGesture(props), props.disabled ?? false, settings);

	return () => props.children;
}
```

Its dedicated entry is the only plugin-specific declaration:

```ts
export { GestureElement as default } from './GestureElement.js'
	with { type: 'exact-plugin' };
```

Module resolution derives canonical identity `@exactjs/gestures#default`.
`GestureElement` itself uses ordinary component compilation. The local
consumer prefix may be renamed without changing that identity.

`createGestureSession()` returns a setup-owned disposable resource. The setup-
scope `reconcile()` call observes every explicit prop, context, element, and
presentation input. Replacement of one prepared definition or component root
therefore reconfigures the stable session without recreating the enhancement;
nested reactive state used by recognizer callbacks remains ordinary deferred
reactivity rather than an accidental setup snapshot. Existing component
disposal, target ref cleanup, activation, event cleanup, and task cancellation
release pointer capture and listeners. The plugin component does not invent
`mount`, `update`, or `remove` hooks.

The implementation should prefer eXact's existing element-event plumbing for
idle listeners. Temporary document/window listeners needed during active
capture are owned by the session and removed on completion, cancellation,
deactivation, lost capture, blur, or component disposal.

## Recognition and event model

Normalized events are semantic and immutable:

```ts
export interface GestureSample {
	readonly phase: 'start' | 'move' | 'end' | 'cancel';
	readonly pointerType: 'mouse' | 'pen' | 'touch' | 'keyboard';
	readonly point: Readonly<{ x: number; y: number }>;
	readonly delta: Readonly<{ x: number; y: number }>;
	readonly velocity: Readonly<{ x: number; y: number }>;
	readonly elapsed: number;
	readonly originalEvent: Event;
}

export interface DragRecognizerInput {
	readonly axis?: 'x' | 'y' | 'both';
	readonly threshold?: number;
	readonly lockDirection?: boolean;
	readonly onStart?: (sample: GestureSample) => void | PromiseLike<void>;
	readonly onMove?: (sample: GestureSample) => void | PromiseLike<void>;
	readonly onEnd?: (sample: GestureSample) => void | PromiseLike<void>;
	readonly onCancel?: (sample: GestureSample) => void | PromiseLike<void>;
}
```

The exact type is specialized for each recognizer, but all share phase,
cancellation, monotonic time, and inspection identity. Coordinates expose
viewport, local, and accumulated forms where meaningful; the proposal must not
force consumers to reverse-engineer transforms.

The initiating DOM event opens the existing interaction frame. Gesture
callbacks invoked synchronously join it. A multi-event session is then owned
by a named component task such as `gesture:drag: card`; later samples remain
inspectable descendants of that session. Async callback work may be awaited by
that task, but high-frequency moves are latest/coalesced so a slow callback
cannot create an unbounded queue.

Recognizer competition is deterministic:

1. explicit definition priority;
2. threshold reached;
3. exclusive group arbitration;
4. simultaneous recognition only when both definitions allow it; and
5. cancellation of losing recognizers before the winner's first move callback.

Nested gesture targets use logical component/target ancestry. Pointer capture
continues delivery to the winner, while press/drag thresholds prevent a drag
from accidentally firing a click-like press.

## Complete standalone component

This component uses gestures with neither physics nor motion:

```tsx
import gesture from '@exactjs/gestures' with { type: 'exact-plugin' };
import { defineGesture, type GestureSample } from '@exactjs/gestures';
import type { Component } from '@exactjs/core';

interface Position {
	x: number;
	y: number;
}

interface MovableCardState {
	position: Position;
	dragOrigin: Position;
	dragging: boolean;
}

export function MovableCard(this: Component<MovableCardState>, props: Readonly<{ title: string }>) {
	this.state.position = { x: 0, y: 0 };
	this.state.dragOrigin = { x: 0, y: 0 };
	this.state.dragging = false;

	const drag = defineGesture({
		semantics: 'control',
		drag: {
			axis: 'both',
			threshold: 4,
			onStart: () => {
				this.state.dragOrigin = { ...this.state.position };
				this.state.dragging = true;
			},
			onMove: (sample: GestureSample) => {
				this.state.position.x = this.state.dragOrigin.x + sample.delta.x;
				this.state.position.y = this.state.dragOrigin.y + sample.delta.y;
			},
			onEnd: () => {
				this.state.dragging = false;
			},
			onCancel: () => {
				this.state.dragging = false;
			}
		},
		keyboard: {
			step: 8,
			onMove: ({ delta }) => {
				this.state.position.x += delta.x;
				this.state.position.y += delta.y;
			}
		}
	});

	return () => (
		<article
			gesture:apply={drag}
			className:dragging={this.state.dragging}
			style={{
				translate: `${this.state.position.x}px ${this.state.position.y}px`
			}}
			tabIndex={0}
			aria-label={`Move ${props.title}`}
		>
			<h2>{props.title}</h2>
			<p>Drag me or use the arrow keys.</p>
		</article>
	);
}
```

The state is ordinary inspectable component state. Removing `gesture:apply`
removes recognition without changing the state architecture.

## Accessibility and browser policy

Definitions must state whether they are decorative or control-like. A
control-like preset either provides keyboard semantics or requires the author
to configure them; TypeScript checking rejects a control-like definition with
no keyboard path and the language server presents the same diagnostic.

The package:

- sets the narrowest required `touch-action` policy;
- does not globally disable scrolling or text selection;
- preserves native click, focus, and context-menu behavior unless the winning
  recognizer explicitly claims it;
- treats focus-visible hover equivalence as a prepared policy;
- cancels safely when a target becomes inactive or inert; and
- exposes ARIA guidance without manufacturing misleading roles.

## Composition contracts

The base package exports its sample and prepared-definition types. It does not
import physics or motion.

Simple composition needs no adapter: callbacks can update application state,
select a motion definition, or call another owned resource. For common direct
manipulation, `@exactjs/physics/gestures` may export `dragBody(body, options)`,
which returns a normal prepared `GestureDefinition`. That optional subpath has
peer dependencies on both packages; neither base entry imports the other.

Plugin components may also publish ordinary contexts to inner components.
Generated context production/consumption contracts determine their order on a
shared root. Such contexts are package APIs, not additions to the renderer
protocol. Cross-package consumption must be isolated in an adapter subpath so
installing gestures alone never loads a physics engine.

## SSR and hydration

SSR uses ordinary component placement. Gesture definitions and callbacks cross
boundaries only when existing component-prop serialization permits it; pointer
state and listeners are never serialized. Hydration adopts the target before
`GestureElement` observes `root.presented` and installs listeners. No gesture
is replayed. A pointer sequence that began before hydration is ignored.

## Inspection and testing

DevTools shows the target site, prepared definition name, active recognizer,
session phase, pointer type, elapsed time, cancellation reason, and causal task.
It does not retain raw events, DOM nodes, callbacks, or full coordinate
histories.

`@exactjs/gestures/testing` supplies a deterministic clock and semantic input
driver. Tests cover thresholds, axis locks, recognizer arbitration, nested
targets, capture loss, blur, deactivation, cancellation, cleanup, coalescing,
keyboard parity, touch-action, SSR adoption, and component disposal. Real
Chromium tests cover pointer capture, touch/scroll interaction, focus, and
multi-pointer pinch behavior.

## Delivery plan

1. Implement prepared definitions, normalized types, deterministic clock, and
   recognizer engine without JSX.
2. Add the attributed `GestureElement` re-export, canonical contract, grouped
   marker entry, and enhancement-target-bound ordinary component activation.
3. Add press, hover, drag, pan, keyboard, and cancellation behavior.
4. Add pinch/rotate and deterministic competition after single-pointer
   behavior is proven.
5. Add testing, inspection, language-tool metadata, docs, samples, README, and
   package agent guidance.
6. Add optional physics/motion adapter subpaths only after the base packages'
   contracts stabilize.

## Acceptance criteria

1. Gestures works without motion, physics, or gravity.
2. The local prefix requires an attributed exact-plugin import, while the
   marker retains canonical package/export identity.
3. All canonical gesture props share the boundary's grouped reactive marker and
   produce one ordinary plugin component per resolved enhancement-target
   generation.
4. The target is resolved by the generic explicit-root-first logical-tree
   traversal without DOM search.
5. Component state and callbacks remain the application source of truth.
6. Active sessions are named, cancelable, component-owned tasks with bounded
   move delivery and deterministic cleanup.
7. Pointer, touch, keyboard, nesting, arbitration, and accessibility policies
   are deterministic and testable.
8. Inactive gesture enhancements leave the target functional; required gesture
   behavior uses an explicit ordinary component or component-library control.
9. Optional adapters compose through ordinary definitions and contexts without
   coupling base packages.
10. SSR and hydration preserve semantic DOM and never replay input.
11. No gesture-specific core lifecycle, state, event, task, or inspection
    system is introduced.
