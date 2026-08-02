import { describe, expect, it } from 'vitest';
import { createPhysicsWorld } from './world.js';

describe('physics world', () => {
	it('applies commands at a fixed-step boundary and replays deterministically', () => {
		function replay() {
			const world = createPhysicsWorld({ fixedStep: 0.1 });
			const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
			body.applyImpulse({ x: 10, y: 0 });
			expect(body.velocity.x).toBe(0);
			expect(world.step(0.05).steps).toBe(0);
			expect(body.velocity.x).toBe(0);
			world.step(0.25);
			return world.inspect();
		}
		expect(replay()).toEqual(replay());
		expect(replay().bodies[0]?.position.x).toBe(3);
	});

	it('bounds catch-up work and reports dropped accumulated time', () => {
		const world = createPhysicsWorld({ fixedStep: 0.1, maxCatchUpSteps: 2 });
		const result = world.step(1.05);
		expect(result.steps).toBe(2);
		expect(result.simulatedSeconds).toBeCloseTo(0.2);
		expect(result.accumulatedSeconds).toBeCloseTo(0.05);
		expect(result.droppedSeconds).toBeCloseTo(0.8);
	});

	it('evaluates force contributors in stable policy order', () => {
		const world = createPhysicsWorld({ fixedStep: 1 });
		const body = world.createBody({ shape: { kind: 'circle', radius: 1 }, mass: 1 });
		const calls: string[] = [];
		world.addForce({
			name: 'later',
			order: 10,
			apply: () => (calls.push('later'), { x: 2, y: 0 })
		});
		world.addForce({
			name: 'first',
			order: -1,
			apply: () => (calls.push('first'), { x: 1, y: 0 })
		});
		world.step(1);
		expect(calls).toEqual(['first', 'later']);
		expect(body.velocity.x).toBe(3);
	});

	it('solves distance constraints without exposing solver iterations', () => {
		const world = createPhysicsWorld({ fixedStep: 0.1, positionIterations: 4 });
		const body = world.createBody({
			position: { x: 10, y: 0 },
			shape: { kind: 'circle', radius: 1 }
		});
		world.createConstraint({ kind: 'distance', bodyA: body, anchor: { x: 0, y: 0 }, length: 5 });
		world.step(0.1);
		expect(body.pose.position.x).toBeCloseTo(5);
	});

	it('publishes deterministically ordered begin, persist, and end collisions', () => {
		const world = createPhysicsWorld({ fixedStep: 0.1 });
		const fixed = world.createBody({
			id: 'a',
			type: 'static',
			shape: { kind: 'circle', radius: 2 }
		});
		const moving = world.createBody({
			id: 'b',
			position: { x: 3, y: 0 },
			shape: { kind: 'circle', radius: 2 }
		});
		expect(world.step(0.1).collisions.map((event) => event.phase)).toEqual(['begin']);
		moving.setPose({ position: { x: 10, y: 0 } });
		expect(world.step(0.1).collisions.map((event) => event.phase)).toEqual(['end']);
		expect(fixed.id).toBe('a');
	});

	it('detects circle-box and box-box contacts with stable body ordering', () => {
		const world = createPhysicsWorld({ fixedStep: 0.1, sleep: false });
		const circle = world.createBody({
			id: 'circle',
			position: { x: 1.5, y: 0 },
			shape: { kind: 'circle', radius: 1 }
		});
		const box = world.createBody({
			id: 'box',
			type: 'static',
			shape: { kind: 'box', width: 2, height: 2 }
		});
		const otherBox = world.createBody({
			id: 'other-box',
			position: { x: 10, y: 0 },
			shape: { kind: 'box', width: 2, height: 2 }
		});
		world.createBody({
			id: 'fixed-box',
			type: 'static',
			position: { x: 11.5, y: 0 },
			shape: { kind: 'box', width: 2, height: 2 }
		});

		const collisions = world.step(0.1).collisions;
		expect(
			collisions.map((event) => [event.bodyA.id, event.bodyB.id, event.phase] as const)
		).toEqual([
			['circle', 'box', 'begin'],
			['other-box', 'fixed-box', 'begin']
		]);
	});

	it('sleeps settled bodies and wakes them through queued input', () => {
		const world = createPhysicsWorld({ fixedStep: 0.1 });
		const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
		world.step(0.5);
		expect(body.sleeping).toBe(true);
		body.applyImpulse({ x: 1, y: 0 });
		expect(body.sleeping).toBe(true);
		world.step(0.1);
		expect(body.sleeping).toBe(false);
	});
});
