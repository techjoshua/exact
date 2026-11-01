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

	it('validates a reassigned field method at the force boundary and permits subsequent work', () => {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
		const field = uniformGravity({ x: 1, y: 0 });
		const application = applyGravity(world, field);
		try {
			field.accelerationAt = () => ({ x: Number.NaN, y: 0 });
			expect(() => world.step(1)).toThrow('non-finite force');
			field.accelerationAt = () => ({ x: 2, y: 0 });
			// Retry the failed fixed step without adding another second of elapsed time.
			world.step(0);
			expect(body.velocity.x).toBe(2);
			const snapshot: { sampleCount: number } = application.inspect();
			snapshot.sampleCount = 100;
			expect(application.inspect().sampleCount).toBe(2);
		} finally {
			application[Symbol.dispose]();
		}
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

	it('revalidates moving attractor policies changed through writable aliases, including coincident points', () => {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		const source = world.createBody({ type: 'static', shape: { kind: 'circle', radius: 1 } });
		const probe = world.createBody({ shape: { kind: 'circle', radius: 1 } });
		const definition = defineGravityAttractor({ strength: 100, softening: 1 });
		const alias: { strength: number; softening: number; maxAcceleration?: number } = definition;
		const registration = new BodyGravityRegistration();
		try {
			registration.configure({
				world,
				body: source,
				scale: 1,
				disabled: false,
				attractor: definition
			});
			alias.softening = 0;
			expect(() => world.step(1)).toThrow('softening');
			alias.softening = 1;
			alias.maxAcceleration = 0;
			expect(() => world.step(0)).toThrow('maxAcceleration');
			delete alias.maxAcceleration;
			alias.strength = Number.NaN;
			expect(() => world.step(0)).toThrow('strength');
			alias.strength = 100;
			world.step(0);
			expect(world.time).toBe(1);
			expect(Number.isFinite(probe.velocity.x)).toBe(true);
		} finally {
			registration[Symbol.dispose]();
		}
	});
});
