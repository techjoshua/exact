# Gravity

`@exactjs/gravity` supplies pure prepared acceleration fields and registers them through
`@exactjs/physics`'s neutral force-contributor seam. Gravity never owns a frame loop, integrator,
DOM projection, or application state.

## Pure fields

```ts
import { combineGravity, pointGravity, uniformGravity } from '@exactjs/gravity';

const earth = uniformGravity({ x: 0, y: 980 }, { name: 'Earth gravity' });
const planet = pointGravity({
	name: 'Planet',
	position: { x: 400, y: 300 },
	strength: 120_000,
	softening: 12,
	maxAcceleration: 4_000
});
const scene = combineGravity('Scene gravity', [earth, planet]);

const acceleration = scene.accelerationAt({ position: probe, time: 0, mass: 1 });
```

Uniform, directional, softened point, radial, bounded, and composite fields are immutable and can
be sampled without a world, component, DOM, or browser. Preparation rejects non-finite values and
unsafe singularity policy. Point and inverse-square fields require positive softening and can cap
acceleration explicitly.

## Physics registration

```ts
const registration = applyGravity(world, earth, {
	groups: ['dynamic'],
	collisionLayers: ['scene'],
	scale: 0.5
});
```

`applyGravity()` adds one named ordered force contributor. Selection can use stable body groups,
collision layers, an explicit body set, or a predicate. Acceleration is converted to force with the
body's mass and composed by vector addition with every other contributor. Disposal removes only
that registration. Bounded inspection reports selected-body, sample, and clamp counts without
retaining force history or predicates.

## Ordinary components

```tsx
<PhysicsWorld world={world}>
	<GravityField field={earth} groups={['dynamic']}>
		<Scene />
	</GravityField>
</PhysicsWorld>
```

`GravityField` transparently owns a subtree-wide registration and follows Activity lifecycle.
`GravityField` and `GravityElement` retain their latest reactive configuration while parked, but
remove their force contributors until the component becomes active again. `GravityElement`
consumes `PhysicsBodyContext` to apply a field to one current body or to expose that body as a
moving prepared attractor. Missing physics context produces a structured component error while the
child remains unchanged.

The optional `gravity:*` namespace accepts `apply`, `scale`, `disabled`, and `attractor`. Use the
explicit components when gravity is required behavior; an inactive optional enhancement is allowed
to leave its target untouched.
