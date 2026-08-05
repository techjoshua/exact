# @exactjs/physics

An eXact component library and deterministic, DOM-independent 2D simulation for applications,
workers, servers, and tests.

## Quick start

Create bodies during component setup, then advance the world manually or through the optional eXact
component surface:

```ts
import { createPhysicsWorld } from '@exactjs/physics';

const world = createPhysicsWorld({ fixedStep: 1 / 120 });
const ball = world.createBody({
	shape: { kind: 'circle', radius: 24 },
	mass: 1,
	restitution: 0.8
});

ball.applyImpulse({ x: 180, y: -260 });
world.step(1 / 60);
```

## Runtime boundary

Worlds own fixed-step accumulation, bodies, forces, distance constraints, circle and axis-aligned
box collisions, sleeping, and bounded inspection. Body commands become visible at the next fixed
step boundary. Collision listeners receive one deterministic batch after an outer `step()` call.

The engine does not require the DOM, gestures, gravity, or motion. The optional `PhysicsWorld` and
transparent `PhysicsElement` components own the browser frame chain and DOM projection. See the
[physics reference](../../docs/physics.md) for component usage and projection channel rules.
The package has no framework-plugin manifest; `@exactjs/physics/testing` exports an ordinary manual
clock helper.
