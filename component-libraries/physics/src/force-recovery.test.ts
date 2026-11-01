import { describe, expect, it } from 'vitest';
import { createPhysicsWorld } from './world.js';
import { captureReactiveMutations } from '@exactjs/reactive';
import { verifyPhysicsForceRecovery } from '../../../packages/component-composition-corpus/test-support/physics-force-recovery-journey.mjs';

describe('physics force failure recovery', () => {
	it('shares the public-package native and browser recovery journey', () => {
		expect(verifyPhysicsForceRecovery({ createPhysicsWorld, captureReactiveMutations })).toBe(true);
	});
	it('does not erase a later queued command when an earlier optimistic simulation is rolled back', async () => {
		const { captureReactiveMutations } = await import('@exactjs/reactive');
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		try {
			const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
			body.applyForce({ x: 2, y: 0 });
			const journal = captureReactiveMutations(() => {
				world.step(1);
			});
			body.applyForce({ x: 3, y: 0 });
			journal.rollback();
			world.step(1);
			// The cancelled simulation restores its consumed force, alongside the later command.
			expect(body.velocity.x).toBe(5);
		} finally {
			world[Symbol.dispose]();
		}
	});

	it('keeps a successful step coordinated with an enclosing reactive rollback', async () => {
		const { batch } = await import('@exactjs/reactive');
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		try {
			const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
			body.applyForce({ x: 2, y: 0 });
			expect(() =>
				batch(() => {
					world.step(1);
					throw new Error('outer');
				})
			).toThrow('outer');
			expect(world.time).toBe(0);
			expect(body.velocity.x).toBe(0);
			world.step(1);
			expect(body.velocity.x).toBe(2);
		} finally {
			world[Symbol.dispose]();
		}
	});

	it('rolls back a queued mode switch with the failed step and reapplies it on retry', () => {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		try {
			const first = world.createBody({ shape: { kind: 'circle', radius: 1 } });
			const second = world.createBody({
				shape: { kind: 'circle', radius: 1 },
				position: { x: 100, y: 0 }
			});
			first.setKinematic(true);
			let failing = true;
			world.addForce({
				name: 'force',
				apply(body) {
					if (body === second && failing) throw new Error('failed step');
				}
			});
			expect(() => world.step(1)).toThrow('failed step');
			expect(first.type).toBe('dynamic');
			failing = false;
			world.step(0);
			expect(first.type).toBe('kinematic');
		} finally {
			world[Symbol.dispose]();
		}
	});

	it('retains queued commands and an earlier body force when a later body fails', () => {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		try {
			const first = world.createBody({ shape: { kind: 'circle', radius: 1 } });
			const second = world.createBody({
				shape: { kind: 'circle', radius: 1 },
				position: { x: 100, y: 0 }
			});
			first.applyForce({ x: 2, y: 0 });
			let failing = true;
			world.addForce({
				name: 'force',
				apply(body) {
					if (body === second && failing) throw new Error('later body');
					return { x: 1, y: 0 };
				}
			});
			expect(() => world.step(1)).toThrow('later body');
			failing = false;
			world.step(0);
			expect(first.velocity.x).toBe(3);
			expect(second.velocity.x).toBe(1);
		} finally {
			world[Symbol.dispose]();
		}
	});

	it('keeps time, pose and consumed forces coordinated when catch-up fails after one tick', () => {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		try {
			const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
			let failing = true;
			world.addForce({
				name: 'force',
				apply() {
					if (world.time >= 1 && failing) throw new Error('later tick');
					return { x: 1, y: 0 };
				}
			});
			expect(() => world.step(2)).toThrow('later tick');
			failing = false;
			world.step(0);
			expect(world.time).toBe(2);
			expect(body.velocity.x).toBe(2);
			expect(body.pose.position.x).toBe(3);
		} finally {
			world[Symbol.dispose]();
		}
	});

	it.each(['throw', 'nonfinite'] as const)(
		'does not retain an earlier contribution after %s',
		(failure) => {
			const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
			try {
				const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
				let failing = true;
				world.addForce({ name: 'first', apply: () => ({ x: 1, y: 0 }) });
				world.addForce({
					name: 'failure',
					apply() {
						if (failing) {
							if (failure === 'nonfinite') return { x: Number.NaN, y: 0 };
							throw new Error('force failure');
						}
					}
				});
				expect(() => world.step(1)).toThrow();
				expect(body.velocity.x).toBe(0);
				failing = false;
				world.step(0);
				expect(body.velocity.x).toBe(1);
				expect(body.pose.position.x).toBe(1);
				expect(world.time).toBe(1);
			} finally {
				world[Symbol.dispose]();
			}
		}
	);
});
