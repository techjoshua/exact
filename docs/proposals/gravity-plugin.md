# Optional gravity plugin and force-field package

## Status

Implemented. Pure prepared uniform, directional, softened point, radial, bounded, and composite
fields; selected physics registrations; moving body attractors; bounded inspection; ordinary
Activity-owned `GravityField`; transparent attributed `GravityElement`; deterministic same-target
physics ordering; host entries; tests; and documentation are available. Application-bundle catalog
activation is shared across the Vite, Bun, and Webpack adapters.

Gravity composes with the force-contributor contract proposed by
[`physics`](physics-plugin.md) and uses the ordinary plugin-component
enhancement ABI in
[`plugin-jsx-renderer-extensions.md`](plugin-jsx-renderer-extensions.md). Its
field mathematics remains usable without DOM, JSX, gestures, or motion.

## Decision summary

Gravity should not be baked into the physics engine and should not become a
second simulation loop:

- `@exactjs/gravity` owns reusable uniform, directional, radial, point-mass,
  orbital, bounded, and composite field definitions;
- a field is a pure, prepared value that can be sampled independently;
- physics owns time integration, bodies, collision, and stepping;
- gravity registers ordered force contributors into an existing physics world;
- an attributed `@exactjs/gravity` import supplies the local `gravity:*`
  prefix and canonical contract for attaching a field to a physics body or
  declaring an element-backed attractor;
- gravity members join the JSX boundary's one grouped reactive marker;
- active gravity and physics entries create ordinary enhancement-target-bound
  components;
  their existing context behavior places `PhysicsElement` outside
  `GravityElement`;
- `GravityElement` consumes `PhysicsBodyContext` and `PhysicsWorldContext`,
  registers a component-owned force contribution, and returns its sole child;
- gravity adds no frame loop, DOM projection, gesture recognition, or motion;
  and
- multiple fields compose deterministically through ordinary components,
  contexts, and the physics force API.

Enhancements are optional by framework contract. An inactive gravity entry
leaves its target unchanged. Applications for which gravity is functionally
required must use the explicit `GravityField`, `GravityElement`, or a
component-library surface so the dependency remains ordinary and visible.

## Why gravity is separate

A physics world needs no universal gravity policy. Useful scenes include:

- no gravity;
- Earth-like constant acceleration;
- sideways or animated fields;
- several local attractors;
- inverse-square orbital systems;
- fields enabled only within a volume; and
- application-defined forces unrelated to gravity.

Keeping gravity separate lets the physics engine expose one generic,
testable force seam. It also lets field math support trajectory previews,
scientific visualizations, games, or server calculations without starting a
world. Gravity remains small and replaceable; physics remains general.

## Field model

A field answers one question without mutating a body:

```ts
export interface GravitySamplePoint {
	readonly position: Vector2;
	readonly time: number;
	readonly mass: number;
}

export interface GravityField {
	readonly name: string;
	accelerationAt(point: GravitySamplePoint): Vector2;
}

export function defineGravityField(
	name: string,
	sample: (point: GravitySamplePoint) => Vector2
): GravityField;
```

Prepared fields are immutable and have stable identity. Built-ins include:

```ts
export {
	boundedGravity,
	combineGravity,
	directionalGravity,
	pointGravity,
	radialGravity,
	uniformGravity
} from '@exactjs/gravity';
```

Examples:

```ts
const earth = uniformGravity({ x: 0, y: 980 }, { name: 'Earth gravity' });

const planet = pointGravity({
	name: 'Planet',
	position: { x: 400, y: 300 },
	strength: 120_000,
	softening: 12,
	maxAcceleration: 4_000
});

const sceneGravity = combineGravity('Scene gravity', [earth, planet]);
```

Units follow the world: position-units per second squared. `softening` avoids
a singularity near a point attractor. `maxAcceleration` provides an explicit
safety bound. Invalid, non-finite, or negative configuration fails during
preparation rather than contaminating a simulation step.

Sampling works without physics:

```ts
const acceleration = planet.accelerationAt({
	position: probePosition,
	time: simulationTime,
	mass: probeMass
});
```

## Physics integration

The physics package defines a neutral force contributor:

```ts
export interface ForceContributor {
	readonly name: string;
	apply(context: ForceStepContext): void;
}
```

Gravity adapts a field without creating another scheduler:

```ts
export function applyGravity(
	world: PhysicsWorld,
	field: GravityField,
	options?: GravityApplicationOptions
): Disposable;
```

On each physics fixed step, the contributor samples applicable awake dynamic
bodies, converts acceleration to force using body mass, and accumulates it in
the world's normal ordered force phase. Registration order is stable, but
correct fields should compose by vector addition rather than depend on order.

`GravityApplicationOptions` can select bodies by stable body group, collision
layer, explicit set, or predicate prepared outside the hot loop. A changing
application collection remains application state; gravity does not mirror it.

## Component and context surface

An explicit component applies a field to a subtree:

```tsx
<PhysicsWorld world={world}>
	<GravityField field={earth} groups={['dynamic']}>
		<Scene />
	</GravityField>
</PhysicsWorld>
```

`GravityField` is an ordinary transparent context/resource component. It reads
the nearest `PhysicsWorldContext`, snapshots its reactive enabled/selection
policy during setup, and registers `applyGravity()` only while active. Activity
deactivation unregisters the contributor; reactivation installs the latest
snapshot through existing component ownership.

Nested fields compose:

```tsx
<GravityField field={earth}>
	<Scene />
	<GravityField field={localAttractor} groups={['satellites']}>
		<SatelliteCluster />
	</GravityField>
</GravityField>
```

The application can also register fields imperatively when component ancestry
is not the desired selection model.

## JSX target surface

Target attributes cover per-body policy and element-backed attractors:

| Attribute                        | Meaning                                                             |
| -------------------------------- | ------------------------------------------------------------------- |
| `gravity:apply={field}`          | Applies one prepared field only to the target's physics body.       |
| `gravity:scale={number}`         | Reactively scales acceleration for that body.                       |
| `gravity:disabled={condition}`   | Temporarily unregisters the body's field contribution.              |
| `gravity:attractor={definition}` | Uses the target physics body's pose as a prepared moving attractor. |

All members form one entry in the boundary's grouped marker. A target with
`gravity:*` normally resolves `PhysicsBodyContext` from `physics:body` on the
same target. An unavailable gravity plugin remains generic inactive-plugin
behavior. An active gravity component without the required physics context is
invalid composition: it reports a structured component error and remains
transparent so the underlying target still renders.

```tsx
import gravity from '@exactjs/gravity' with { type: 'exact-plugin' };
import physics from '@exactjs/physics' with { type: 'exact-plugin' };

<div physics:body={moon} gravity:apply={planetGravity} />;
```

`PhysicsElement` publishes `PhysicsBodyContext`, while `GravityElement`
optionally consumes it. The generated context contracts therefore order
physics outside gravity independently of JSX attribute order:

```text
PhysicsElement
â””â”€â”€ GravityElement
    â””â”€â”€ original target
```

The ordinary plugin component props define the canonical schema:

```tsx
export interface GravityElementProps {
	apply?: GravityField;
	scale?: number;
	disabled?: boolean;
	attractor?: GravityAttractorDefinition;
	children?: Child;
}
```

Conceptually, `GravityElement` is small:

```tsx
function GravityElement(this: Component<{}>, props: GravityElementProps) {
	const physics = this.hasContext(PhysicsBodyContext)
		? this.getContext(PhysicsBodyContext)
		: undefined;
	if (!physics) {
		this.log.error('Gravity enhancement requires a physics body', {
			enhancement: '@exactjs/gravity#default',
			missingContext: 'PhysicsBodyContext'
		});
		return () => props.children;
	}

	const registration = createBodyGravityRegistration();
	this.onUnmount(() => registration[Symbol.dispose]());

	function configure(
		world: PhysicsWorld,
		body: PhysicsBody,
		field: GravityField | undefined,
		scale: number,
		disabled: boolean,
		attractor: GravityAttractorDefinition | undefined,
		task: TaskContext = TaskContext.client().latest().normal().nonblocking()
	) {
		registration.configure({ world, body, field, scale, disabled, attractor }, task.signal);
	}

	configure(
		physics.world,
		physics.body,
		props.apply,
		props.scale ?? 1,
		props.disabled ?? false,
		props.attractor
	);
	return () => props.children;
}
```

The attributed re-export establishes the capability without changing ordinary
compilation of `GravityElement` itself:

```ts
export { GravityElement as default } from './GravityElement.js'
	with { type: 'exact-plugin' };
```

Module resolution derives canonical identity `@exactjs/gravity#default`.
Existing compiler context analysis records optional consumption of
`PhysicsBodyContext`; no plugin-specific ordering metadata is authored.

The registration is a normal component-owned resource. Its setup-scope
`configure()` activation receives the current context and every enhancement
prop explicitly, so replacement of `physics.body` atomically moves the force
contribution without recreating the enhancement component. Nested body-state
changes do not reactivate configuration merely because the body prop was read.

There are no gravity renderer hooks. A missing or ambiguous physics body is a
source diagnostic when statically provable. Runtime validation remains required
for precompiled and dynamically assembled trees: every active invalid instance
emits its structured error through the existing component logger, performs no
gravity work, and returns its child unchanged. The enhancement adds no
deduplication or throttling; application logger configuration remains
authoritative. The runtime never guesses a body from DOM ancestry.

An element-backed attractor definition uses the physics body's simulated pose,
not DOM measurement. Gravity therefore remains usable in workers and tests and
does not lag a rendered frame.

## Complete standalone field component

This example uses gravity and physics without gestures or motion:

```tsx
import physics from '@exactjs/physics' with { type: 'exact-plugin' };
import { GravityField, pointGravity, uniformGravity } from '@exactjs/gravity';
import { PhysicsWorld, createPhysicsWorld } from '@exactjs/physics';
import type { Component } from '@exactjs/core';

interface OrbitDemoState {
	earthEnabled: boolean;
}

export function OrbitDemo(this: Component<OrbitDemoState>) {
	this.state.earthEnabled = false;

	const world = createPhysicsWorld({ fixedStep: 1 / 240 });
	const satellite = world.createBody({
		position: { x: 320, y: 120 },
		velocity: { x: 190, y: 0 },
		shape: { kind: 'circle', radius: 10 },
		mass: 1
	});

	const planet = pointGravity({
		name: 'Demo planet',
		position: { x: 320, y: 280 },
		strength: 45_000,
		softening: 24,
		maxAcceleration: 1_800
	});

	const earth = uniformGravity({ x: 0, y: 180 }, { name: 'Downward assist' });

	return () => (
		<PhysicsWorld world={world} running>
			<GravityField field={planet}>
				<GravityField field={earth} enabled={this.state.earthEnabled}>
					<section className="orbit-demo">
						<button
							onClick={() => {
								this.state.earthEnabled = !this.state.earthEnabled;
							}}
						>
							Toggle downward field
						</button>
						<div className="satellite" physics:body={satellite} />
					</section>
				</GravityField>
			</GravityField>
		</PhysicsWorld>
	);
}
```

Gravity contributes forces; physics performs every step and projects the
satellite. Removing either `GravityField` cleanly unregisters only its own
contributor.

## Complete four-package composition

The concise composition is intentionally ordinary:

```tsx
import gesture from '@exactjs/gestures' with { type: 'exact-plugin' };
import gravity from '@exactjs/gravity' with { type: 'exact-plugin' };
import motion from '@exactjs/motion' with { type: 'exact-plugin' };
import physics from '@exactjs/physics' with { type: 'exact-plugin' };
import { dragBody } from '@exactjs/physics/gestures';
import { defineMotion } from '@exactjs/motion';
import { uniformGravity } from '@exactjs/gravity';
import { PhysicsWorld, createPhysicsWorld } from '@exactjs/physics';
import type { Component } from '@exactjs/core';

const cardPresence = defineMotion({
	enter: {
		keyframes: [
			{ opacity: 0, scale: 0.96 },
			{ opacity: 1, scale: 1 }
		],
		options: { duration: 140, easing: 'ease-out' }
	},
	leave: {
		keyframes: [
			{ opacity: 1, scale: 1 },
			{ opacity: 0, scale: 0.96 }
		],
		options: { duration: 100, easing: 'ease-in' }
	}
});

const earth = uniformGravity({ x: 0, y: 980 }, { name: 'Board gravity' });

interface TossableCardState {
	visible: boolean;
}

export function TossableCard(
	this: Component<TossableCardState>,
	props: Readonly<{ title: string }>
) {
	this.state.visible = true;

	const world = createPhysicsWorld({ fixedStep: 1 / 120 });
	const card = world.createBody({
		position: { x: 80, y: 40 },
		shape: { kind: 'box', width: 240, height: 120 },
		mass: 1,
		damping: 0.08,
		angularDamping: 0.12
	});
	const drag = dragBody(card, { throwOnRelease: true, keyboardStep: 12 });

	return () => (
		<PhysicsWorld world={world} running>
			<button onClick={() => (this.state.visible = !this.state.visible)}>Toggle card</button>
			{this.state.visible ? (
				<article
					gesture:apply={drag}
					physics:body={card}
					gravity:apply={earth}
					motion:apply={cardPresence}
					tabIndex={0}
				>
					<h2>{props.title}</h2>
					<p>Drag, throw, or move with the keyboard.</p>
				</article>
			) : null}
		</PhysicsWorld>
	);
}
```

One generic boundary contains one grouped marker with four entries. Generated
context contracts always keep gravity inside physics. Gesture and motion are
unrelated in this example and use canonical identity as the deterministic
tie-break. One possible resulting component chain is:

```text
GestureElement          recognizes drag and keyboard intent
â””â”€â”€ PhysicsElement      owns body projection and publishes body context
    â””â”€â”€ GravityElement  contributes acceleration to that body
        â””â”€â”€ MotionElement  owns enter/leave opacity and scale
            â””â”€â”€ article    is the resolved shared root
```

The gesture adapter makes the body kinematic during direct manipulation,
writes its pose at physics command boundaries, and releases sampled velocity.
Gravity resumes contribution through the same world step. Physics owns
translate/rotate; motion owns opacity/scale and its generation-fenced leave.
No package coordinates peer promises, duplicates the scheduler, or takes over
application state.

## Safety and numerical policy

Gravity preparation rejects non-finite values. Point and radial fields require
softening or a documented bounded singularity policy. Every built-in supports
an acceleration cap. A development diagnostic reports persistent clamping,
which usually indicates mismatched units or an unstable scene.

Fields must be pure for one step. A reactive field configuration is snapshotted
at the physics command boundary; it cannot change halfway through a solver
iteration. Expensive spatial fields may prepare an index, but that index is an
owned disposable resource and must retain deterministic sampling for a fixed
input.

## SSR, workers, inspection, and testing

Pure field sampling works on server and in workers. SSR starts no loop and
serializes no live field registration. Hydration adopts physics targets before
client world projection begins.

Inspection shows field names, types, parameters after redaction, selected body
counts, clamp counts, registration ancestry, and the owning physics world. It
does not retain arbitrary predicate callbacks or unbounded per-body force
history.

Tests cover built-in field vectors, singularity bounds, units, composition,
selection, registration/disposal, reactive enable/scale, deterministic physics
integration, moving attractors, Activity pause/resume, SSR imports, and the
four-package example. Property tests protect finite output, symmetry where
promised, inverse-square monotonicity outside softening, and deterministic
vector composition.

## Delivery plan

1. Finalize the physics `ForceContributor` and fixed-step command boundary.
2. Implement pure field types, uniform/directional/point/radial/composite
   definitions, numerical validation, and property tests.
3. Implement `applyGravity()` and explicit `<GravityField>` using ordinary
   context and component resource ownership.
4. Add the attributed `GravityElement` re-export, generated canonical contract,
   context-derived physics ordering, grouped marker entry,
   enhancement-target-bound activation, and ordinary component behavior for
   per-body fields and attractors.
5. Add deterministic testing, inspection, language metadata, docs, examples,
   README, and package agent guidance.

## Acceptance criteria

1. Field definitions can be sampled without DOM, JSX, gestures, motion, or a
   running physics world.
2. Gravity contributes through the physics force seam and never starts a
   second loop or integrator.
3. The local prefix requires an attributed import while markers retain
   canonical package/export identity.
4. Canonical gravity props share the boundary's grouped reactive marker and
   produce one ordinary plugin component per resolved enhancement-target
   generation.
5. Same-target physics/gravity composition has deterministic component order
   and context visibility independent of attribute order.
6. Inactive gravity or physics enhancements leave the target unchanged and
   follow generic host warning rules. An active gravity enhancement with no
   physics body reports invalid composition through the component logger,
   performs no work, and also leaves the target unchanged.
7. Multiple fields compose and dispose independently through ordinary
   components and contexts.
8. Numerical bounds prevent singular or non-finite forces from contaminating
   a world step.
9. The four-package component composes gesture intent, physics integration,
   gravity force, and motion presence without shared ad hoc lifecycle code.
10. No gravity-specific scheduler, renderer, state, lifecycle, or inspection
    architecture is added to core.
