# @exactjs/gravity

Pure prepared acceleration fields and optional physics registrations for eXact applications.

## Quick start

```tsx
import { GravityField, uniformGravity } from '@exactjs/gravity';
import { PhysicsWorld } from '@exactjs/physics';

const earth = uniformGravity({ x: 0, y: 980 }, { name: 'Earth gravity' });

<PhysicsWorld world={world}>
	<GravityField field={earth} groups={['dynamic']}>
		<Scene />
	</GravityField>
</PhysicsWorld>;
```

## Runtime boundary

Fields are immutable pure values that can be sampled without a world, DOM, or component. Gravity
registers named ordered force contributors into an existing physics world; it never starts a frame
loop or integrates state. Uniform, directional, softened point, radial, bounded, and composite
fields reject invalid numerical configuration before simulation.

Use `GravityElement` for one current `PhysicsBodyContext`, or `applyGravity()` for imperative world
selection. Component-owned registrations are installed only while their component is active, so
parked Activity subtrees contribute no force. See [gravity](../../docs/gravity.md) for selection and
composition details.
