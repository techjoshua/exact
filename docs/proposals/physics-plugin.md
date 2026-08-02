# Optional physics plugin and simulation package

## Status

Implemented. The DOM-independent fixed-step engine, bodies, ordered forces, distance constraints,
circle and box collisions, sleeping, bounded inspection, manual testing clock, ordinary
`PhysicsWorld` ownership component, transparent attributed `PhysicsElement`, body/world contexts,
and safe CSS projection policies are available. Vite bundle-local catalog activation is shared
with the other renderer enhancements. Optional gesture, motion, and worker convenience adapters
remain deferred and do not couple the base engine to those packages.

The DOM projection described here depends on
[`plugin-jsx-renderer-extensions.md`](plugin-jsx-renderer-extensions.md). The
simulation engine remains usable without JSX, DOM, gestures, gravity, or
motion. The package uses the current eXact scheduler, component ownership,
contexts, cancellation, SSR, hydration, and inspection facilities.

## Decision summary

Physics should be a separate deterministic simulation package with an optional
eXact JSX enhancement:

- the engine owns worlds, fixed-step integration, bodies, constraints,
  collisions, sleeping, impulses, and force accumulation;
- the engine is DOM-independent and can be stepped manually in tests, workers,
  servers, canvas renderers, or application code;
- an attributed `@exactjs/physics` import supplies the local `physics:*`
  prefix while canonical identity derives from its attributed export;
- physics attributes join the JSX boundary's one grouped reactive marker;
- an active entry creates an ordinary `PhysicsElement` instance tied to the
  resolved enhancement-target generation;
- `PhysicsElement` projects one body through its logical child and publishes
  ordinary body/world context for inner enhancement components;
- the package uses the existing task scheduler for frame ownership and never
  adds its own application-visible scheduler;
- physics works without gestures by accepting impulses, setters, constraints,
  or application state changes directly;
- physics works without motion by projecting pose through independent CSS
  translate/rotate channels or by exposing reactive state-only pose; and
- gesture, gravity, and motion integration remains optional composition rather
  than a required dependency of the base engine.

Enhancements are optional by framework contract. An inactive physics entry
leaves its target unchanged. Applications whose simulation depends on the DOM
attachment must use the explicit `PhysicsElement` or another explicit component
surface so that the dependency cannot silently disappear.

## Ownership boundary

Physics owns:

- deterministic time integration and catch-up policy;
- body pose, velocity, acceleration, mass, inertia, damping, and sleep state;
- constraints, impulses, collisions, and collision events;
- ordered force contributors;
- simulation clocks, stepping, pause/resume, and disposal;
- optional DOM pose projection; and
- bounded simulation inspection and deterministic test drivers.

Physics does not own:

- pointer or keyboard recognition;
- enter/leave, route, layout, or keyframe animation;
- a special gravity constant or scene policy;
- application collections or component state;
- DOM reconciliation, element removal, or presence retention; or
- a second component/task/context/reactivity/lifecycle system.

Gravity is deliberately separate: physics defines the generic `ForceField`
and force-contributor seam, while `@exactjs/gravity` supplies useful fields and
registration components. Applications can run physics with no gravity, a
custom force, or several gravity fields.

## DOM-independent engine

The primary API is an owned resource:

```ts
export interface PhysicsWorldOptions {
	readonly fixedStep?: number;
	readonly maxCatchUpSteps?: number;
	readonly velocityIterations?: number;
	readonly positionIterations?: number;
	readonly sleep?: boolean;
}

export interface PhysicsWorld extends Disposable {
	readonly time: number;
	readonly running: boolean;
	createBody(definition: PhysicsBodyDefinition): PhysicsBody;
	createConstraint(definition: PhysicsConstraintDefinition): PhysicsConstraint;
	addForce(contributor: ForceContributor): Disposable;
	step(elapsedSeconds: number): PhysicsStepResult;
	start(): void;
	pause(): void;
}

export function createPhysicsWorld(options?: PhysicsWorldOptions): PhysicsWorld;
```

`fixedStep` defaults to a documented stable value such as `1 / 120`. Real
elapsed time is accumulated and processed in bounded fixed increments.
`maxCatchUpSteps` prevents a backgrounded tab from producing an unbounded
burst. Dropped accumulated time is visible in inspection and test results.

Bodies expose coherent inspectable state:

```ts
export interface PhysicsBody {
	readonly id: string;
	readonly pose: Readonly<{
		position: Readonly<{ x: number; y: number }>;
		angle: number;
	}>;
	readonly velocity: Readonly<{ x: number; y: number }>;
	readonly angularVelocity: number;
	readonly sleeping: boolean;
	applyForce(force: Vector2, point?: Vector2): void;
	applyImpulse(impulse: Vector2, point?: Vector2): void;
	setPose(pose: Partial<PhysicsPose>, options?: SetPoseOptions): void;
	setKinematic(active: boolean): void;
	wake(): void;
}
```

Mutation is intentional and inspectable. A world applies commands at a
defined step boundary so collision callbacks, gesture input, and external
tasks cannot observe a half-integrated state.

The first implementation should be two-dimensional. A stable 2D engine with
clear units is more useful than an ambiguous 2D/3D abstraction. A future 3D
package can share mathematical types without weakening the 2D contract.

## Scheduler and ownership

`<PhysicsWorld>` is an ordinary context-producing component that owns or borrows a world:

```tsx
<PhysicsWorld world={world} running={this.state.active}>
	<Scene />
</PhysicsWorld>
```

When running, it owns one detached, component-owned frame loop because a
continuous simulation cannot structurally settle under an interaction. Each
browser tick schedules bounded fixed steps as immediate, nonblocking work
through the current eXact scheduler. Pausing, Activity deactivation, component
disposal, document suspension policy, or an ownership abort cancels the next
tick and observers.

Discrete commands caused by an event or task remain causally visible under
that interaction even though subsequent autonomous stepping belongs to the
world loop. Collision callbacks execute in a named `physics:step` task and are
coalesced before reactive consumers are notified.

Manual `world.step()` performs no scheduling and is deterministic for tests,
SSR calculations, workers, and offline simulation.

## JSX projection

The common DOM form attaches a body:

```tsx
import physics from '@exactjs/physics' with { type: 'exact-plugin' };

<div physics:body={ball} />;
```

The initial schema is:

| Attribute                       | Meaning                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| `physics:body={body}`           | Associates the target with one prepared body.               |
| `physics:project={projection}`  | Selects a prepared DOM projection policy.                   |
| `physics:disabled={condition}`  | Reactively disables projection without destroying the body. |
| `physics:collisions={listener}` | Adds a prepared, named collision listener for this body.    |

The default projection is `positionAndRotation`. Presets and custom policies
are prepared values:

```ts
export {
	positionAndRotation,
	positionOnly,
	rotationOnly,
	stateOnly
} from '@exactjs/physics/projections';

export function definePhysicsProjection(input: PhysicsProjectionInput): PhysicsProjection;
```

`stateOnly` performs no DOM writes; application code can bind `body.pose` to
canvas, SVG attributes, or ordinary JSX styles.

The ordinary component props define the canonical schema:

```tsx
export interface PhysicsElementProps {
	body: PhysicsBody;
	project?: PhysicsProjection;
	disabled?: boolean;
	collisions?: PhysicsCollisionListener;
	children?: Child;
}
```

Conceptually:

```tsx
function PhysicsElement(this: Component<{}>, props: PhysicsElementProps) {
	const root = this.refs.root<HTMLElement | SVGElement>();
	const world = this.getContext(PhysicsWorldContext);
	this.setContext(PhysicsBodyContext, {
		get body() {
			return props.body;
		},
		world
	});

	const controller = createBodyProjectionController(world);
	this.onUnmount(() => controller[Symbol.dispose]());

	function configure(
		body: PhysicsBody,
		element: HTMLElement | SVGElement | undefined,
		presented: boolean,
		disabled: boolean,
		project: PhysicsProjection,
		collisions: PhysicsCollisionListener | undefined,
		task: TaskContext = TaskContext.client().latest().immediate().nonblocking()
	) {
		controller.configure(
			{ body, element, presented, disabled, projection: project, collisions },
			task.signal
		);
	}

	configure(
		props.body,
		root.current,
		root.presented,
		props.disabled ?? false,
		props.project ?? positionAndRotation,
		props.collisions
	);

	return () => props.children;
}
```

The dedicated plugin entry is declarative:

```ts
export { PhysicsElement as default } from './PhysicsElement.js'
	with { type: 'exact-plugin' };
```

The attributed re-export derives the schema and module resolution derives
canonical identity `@exactjs/physics#default`; `PhysicsElement` itself receives
ordinary component compilation.

The projection controller is a component-owned disposable resource. Its setup-
scope `configure()` call treats every explicitly supplied prop and root
expression as an ordinary activation dependency. In particular, reading
`props.body` tracks replacement of that prop slot; it does not subscribe the
configuration task to every nested pose or velocity mutation. Same-body engine
updates therefore continue through the body's existing reactive simulation
surface without reconfiguring projection on every step.

Replacing `body` preserves the enhancement component and atomically detaches
the controller's old body subscriptions and collision listener before binding
the new body. Root loss suspends DOM projection without discarding the current
body association; root replacement rebinds projection while preserving the
component. Superseded configuration is generation fenced and component disposal
detaches everything exactly once.

The root comes from ordinary component-root resolution after the renderer has
already selected the enhancement target. The plugin component does not query
DOM or own reconciliation. It may remain transparent; an explicit structural
component remains available when a wrapper is useful.

The direct `setContext()` call makes the current body/world value available to
inner enhancement components on the same target. The getter preserves reactive
body-prop replacement for consumers. Generated context contracts therefore
order optional consumers such as gravity without plugin-specific dependency
metadata. No React-style context-provider element or new core context mechanism
is implied.

## Projection channel rules

Physics can render without motion by writing CSS individual transform
properties:

- position uses `translate`;
- angle uses `rotate`; and
- scale is not claimed by the initial physics projection.

Individual transform properties compose with an authored `transform` value
and let motion use opacity or scale independently. The compiler rejects a
same-site authored `style.translate` or `style.rotate` binding that conflicts
with the selected static projection. Dynamic or component-root conflicts
produce a development diagnostic and select the configured conflict policy;
they never silently overwrite an authored renderer binding.

Where additive Web Animations composition is reliable, motion may temporarily
compose another translation channel. Otherwise the application must assign
non-overlapping channels or use a prepared adapter. There is no universal
plugin-level style bag and no uncontrolled last-writer-wins order.

DOM projection batches writes after a completed fixed-step batch. It must not
publish every solver iteration through general component reactivity. Reactive
body snapshots are coalesced once per outer step for application consumers and
inspection.

## Complete standalone component

This example uses physics without gestures, gravity, or motion:

```tsx
import physics from '@exactjs/physics' with { type: 'exact-plugin' };
import { PhysicsWorld, createPhysicsWorld, type PhysicsBody } from '@exactjs/physics';
import type { Component } from '@exactjs/core';

interface BouncingBallState {
	launches: number;
}

export function BouncingBall(this: Component<BouncingBallState>) {
	this.state.launches = 0;

	const world = createPhysicsWorld({
		fixedStep: 1 / 120,
		maxCatchUpSteps: 8
	});

	const floor = world.createBody({
		type: 'static',
		position: { x: 0, y: 280 },
		shape: { kind: 'box', width: 480, height: 20 }
	});

	const ball = world.createBody({
		position: { x: 120, y: 80 },
		shape: { kind: 'circle', radius: 24 },
		mass: 1,
		restitution: 0.82,
		damping: 0.01
	});

	function launch() {
		this.state.launches++;
		ball.applyImpulse({ x: 180, y: -260 });
	}

	return () => (
		<PhysicsWorld world={world} running>
			<section className="demo" aria-label="Physics demo">
				<div className="floor" physics:body={floor} />
				<button
					className="ball"
					physics:body={ball}
					onClick={launch}
					aria-label={`Launch ball; launched ${this.state.launches} times`}
				/>
			</section>
		</PhysicsWorld>
	);
}
```

The click applies an impulse directly. A custom force contributor could pull
the ball without installing the gravity package.

## Gesture, gravity, and motion composition

The base entry has no dependency on those packages.

- `@exactjs/physics/gestures` may export `dragBody(body, options)`, returning a
  prepared gesture definition that makes a body kinematic while dragging and
  releases it with the sampled velocity.
- `@exactjs/gravity` implements the physics force-contributor interface and
  optionally consumes `PhysicsBodyContext` in its ordinary plugin component.
- Motion can independently animate opacity/scale for enter and leave while
  physics owns translate/rotate. A later adapter may prepare a more elaborate
  channel handoff without coupling base entries.

Adapters are optional peer-dependent subpaths. Physics alone never imports or
loads gesture recognition, gravity presets, or the motion driver.

## SSR, hydration, and workers

SSR may manually step a world for deterministic application calculation, but
the transparent DOM enhancement emits the unchanged semantic target and does not
serialize a live loop. Authors who require a nonzero initial pose without a
hydration jump bind that initial pose through ordinary SSR-visible styles or
attributes. Hydration adopts the target before projection starts.

The engine must avoid browser globals. A worker adapter transports bounded
step commands and snapshots with generation fencing; it is a later package
subpath, not the default architecture. Stale worker snapshots cannot overwrite
a newer local generation.

## Inspection and testing

Inspection shows world identity, clock state, accumulated/dropped time, body
count, awake count, constraint count, current step, bounded body pose/velocity,
force contributor names, and causal tasks. It never retains target elements,
collision callback functions, or an unbounded step history.

`@exactjs/physics/testing` supplies a manual clock and assertion helpers.
Protection includes deterministic fixed-step results, catch-up bounds,
constraint invariants, collision ordering, sleeping/waking, command boundary
ordering, cancellation, Activity pause/resume, component disposal, projection
coalescing, transform conflict diagnostics, hydration adoption, and stale
worker generations. Property tests are appropriate for finite numbers,
non-penetration bounds, and deterministic replay.

## Delivery plan

1. Implement vector math, fixed-step world, bodies, impulses, sleeping, manual
   clocks, and deterministic tests without DOM.
2. Add constraints and collision shapes incrementally with invariant-focused
   coverage.
3. Add `<PhysicsWorld>`, contexts, scheduler ownership, inspection, and
   Activity/disposal behavior.
4. Add the attributed `PhysicsElement` re-export, canonical contract, grouped
   marker entry, enhancement-target-bound activation, and
   state-only/translate/rotate projections.
5. Add SSR/hydration behavior, testing utilities, docs, samples, README,
   language metadata, and package agent guidance.
6. Add optional gesture, motion, or worker adapters only after the engine and
   projection contracts stabilize.

## Acceptance criteria

1. The simulation engine works deterministically without DOM, gestures,
   gravity, or motion.
2. Physics uses one owned fixed-step loop built on the existing scheduler and
   supports manual stepping without it.
3. Body mutation is coherent, inspectable, and applied at documented step
   boundaries.
4. The local prefix requires an attributed import while markers retain
   canonical package/export identity.
5. Canonical physics props share the boundary's grouped reactive marker and
   mount one ordinary plugin component per resolved enhancement-target
   generation; body-prop replacement rebinds its projection resource without
   recreating that component.
6. Target projection works without motion and never silently overwrites an
   authored visual channel.
7. Continuous solver iterations are batched rather than flooding general
   reactivity.
8. Inactive physics enhancements leave the target unchanged; required DOM
   simulation uses an explicit ordinary component.
9. Optional adapters compose without coupling or loading the base packages.
10. SSR, hydration, Activity, cancellation, and disposal reuse existing
    framework ownership.
11. No physics-specific component, lifecycle, task, context, range, or
    inspection architecture is added to core.
