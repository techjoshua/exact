# Physics

`@exactjs/physics` provides a deterministic two-dimensional simulation engine and an optional eXact
DOM projection. The engine has no browser dependency and works in components, workers, servers,
canvas renderers, and tests.

## Worlds and fixed steps

```ts
import { createPhysicsWorld } from '@exactjs/physics';

const world = createPhysicsWorld({ fixedStep: 1 / 120, maxCatchUpSteps: 8 });
const ball = world.createBody({
	shape: { kind: 'circle', radius: 24 },
	mass: 1,
	restitution: 0.82
});

ball.applyImpulse({ x: 180, y: -260 });
world.step(1 / 60);
```

Elapsed time accumulates and advances in stable fixed increments. Catch-up is bounded; discarded
whole steps remain visible through `PhysicsStepResult` and `world.inspect()`. Body forces, impulses,
pose changes, and kinematic changes are queued and become visible together at the next fixed-step
boundary. One outer step batches reactive pose publication and collision callbacks.

Worlds support dynamic, static, and kinematic circle or axis-aligned box bodies, stable selection
groups and collision layers, ordered named force contributors, distance constraints, impulses,
restitution, damping, sleeping, and deterministic
`begin`/`persist`/`end` collision batches. `@exactjs/physics/testing` supplies a manual clock.

## Component ownership

```tsx
<PhysicsWorld world={world} running={this.state.active}>
	<PhysicsElement body={ball}>
		<button aria-label="Launch ball" />
	</PhysicsElement>
</PhysicsWorld>
```

`PhysicsWorld` owns one browser frame chain while active and pauses it with Activity deactivation or
unmounting. It disposes a world it creates from `options`, but only pauses a supplied world.
`PhysicsElement` is a transparent ordinary component: its logical intrinsic root is the projection
target, and replacing configuration reuses the durable component-owned controller.

Use the explicit component when DOM attachment is required. The optional `physics:*` namespace is
safe enhancement and can remain inactive when a host does not advertise the capability.

## Projection channels

The default `positionAndRotation` projection writes CSS individual `translate` and `rotate`
properties. `positionOnly`, `rotationOnly`, and `stateOnly` are available from
`@exactjs/physics/projections`; `definePhysicsProjection()` prepares custom policy. Physics never
claims scale or the authored `transform` property.

An already-authored channel is preserved and produces a development diagnostic. A channel changed
after physics claimed it is released rather than overwritten. Disabling, root replacement,
deactivation, and disposal restore only values still owned by the projection.

`PhysicsBodyContext` publishes the body and world to inner same-target enhancements such as gravity.
Gesture and gravity adapters remain optional: the base package imports neither.
