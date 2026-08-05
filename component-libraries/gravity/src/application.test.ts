import { createPhysicsWorld } from '@exactjs/physics';
import { describe, expect, it } from 'vitest';
import { applyGravity } from './application.js';
import { defineGravityAttractor } from './attractors.js';
import { BodyGravityRegistration } from './registration.js';
import { uniformGravity } from './fields.js';

describe('gravity physics integration', () => {
	it('selects stable body metadata and unregisters independently', () => {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		const selected = world.createBody({
			groups: ['satellites'],
			collisionLayer: 'space',
			shape: { kind: 'circle', radius: 1 },
			mass: 2
		});
		const ignored = world.createBody({ shape: { kind: 'circle', radius: 1 }, mass: 2 });
		const application = applyGravity(world, uniformGravity({ x: 0, y: 10 }), {
			groups: ['satellites'],
			collisionLayers: ['space']
		});
		world.step(1);
		expect(selected.velocity.y).toBe(10);
		expect(ignored.velocity.y).toBe(0);
		expect(application.inspect()).toMatchObject({ selectedBodies: 1, sampleCount: 1 });

		application[Symbol.dispose]();
		world.step(1);
		expect(selected.velocity.y).toBe(10);
	});

	it('composes registrations through vector addition', () => {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
		applyGravity(world, uniformGravity({ x: 2, y: 0 }, { name: 'horizontal' }));
		applyGravity(world, uniformGravity({ x: 0, y: 3 }, { name: 'vertical' }));
		world.step(1);
		expect(body.velocity).toEqual({ x: 2, y: 3 });
	});

	it('uses a target body pose as a moving attractor and excludes the source', () => {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		const source = world.createBody({
			type: 'static',
			position: { x: 10, y: 0 },
			shape: { kind: 'circle', radius: 1 }
		});
		const probe = world.createBody({ shape: { kind: 'circle', radius: 1 } });
		const registration = new BodyGravityRegistration();
		registration.configure({
			world,
			body: source,
			scale: 1,
			disabled: false,
			attractor: defineGravityAttractor({ strength: 100, softening: 1 })
		});
		world.step(1);
		expect(probe.velocity.x).toBeGreaterThan(0);
		expect(source.velocity.x).toBe(0);

		registration[Symbol.dispose]();
		const previous = probe.velocity.x;
		world.step(1);
		expect(probe.velocity.x).toBe(previous);
	});
});
