# @exactjs/physics

Deterministic, DOM-independent 2D simulation for eXact applications, workers, servers, and tests.

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

The engine does not require the DOM, gestures, gravity, or motion. See the
[physics proposal](../../docs/proposals/physics-plugin.md) while the optional component and DOM
projection surfaces are being completed.
