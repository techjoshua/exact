import { verifyPhysicsReadonlyValues } from '../../../packages/component-composition-corpus/test-support/physics-force-recovery-journey.mjs';
import { describe, expect, it } from 'vitest';
import { createPhysicsWorld } from './world.js';
import { definePhysicsProjection } from './projections.js';
import { definePhysicsCollisionListener } from './collisions.js';

// Type checking protects readonly views while ordinary aliases retain JavaScript mutation.
function readonlyControl(projection: ReturnType<typeof definePhysicsProjection>): void {
	// @ts-expect-error Projection names remain readonly in the public TypeScript view.
	projection.name = 'changed';
}
void readonlyControl;

describe('physics readonly values', () => {
	it('shares public-package and browser alias controls', () => {
		expect(
			verifyPhysicsReadonlyValues({
				createPhysicsWorld,
				definePhysicsProjection,
				definePhysicsCollisionListener
			})
		).toBe(true);
	});
	it('keeps shapes, groups and inspection copies writable through ordinary aliases', () => {
		const world = createPhysicsWorld();
		try {
			const shape = { kind: 'circle' as const, radius: 1 };
			const groups = ['original'];
			const body = world.createBody({ shape, groups });
			shape.radius = 4;
			groups.push('outside');
			expect(body.shape).toEqual({ kind: 'circle', radius: 1 });
			expect(body.groups).toEqual(['original']);
			const shapeAlias: typeof shape = body.shape as typeof shape;
			shapeAlias.radius = 2;
			const snapshot = world.inspect();
			const position: { x: number; y: number } = snapshot.bodies[0]!.position;
			position.x = 99;
			expect(body.pose.position.x).toBe(0);
			expect(body.shape).toEqual({ kind: 'circle', radius: 2 });
		} finally {
			world[Symbol.dispose]();
		}
	});
	it('allows writable aliases of projection policies, listeners and step results', () => {
		const input = { name: 'custom', channels: ['translate' as const], apply() {} };
		const projection = definePhysicsProjection(input);
		input.channels.push('translate');
		expect(projection.channels).toEqual(['translate']);
		const alias: { name: string; apply: typeof projection.apply } = projection;
		alias.name = 'updated';
		alias.apply = () => {};
		const listener = definePhysicsCollisionListener('before', () => {});
		const named: { physicsName?: string } = listener;
		named.physicsName = 'after';
		expect(listener.physicsName).toBe('after');
		const world = createPhysicsWorld();
		try {
			const result = world.step(0);
			const mutable: { steps: number } = result;
			mutable.steps = 99;
			expect(world.inspect().step).toBe(0);
		} finally {
			world[Symbol.dispose]();
		}
	});
});
