import { verifyPhysicsFiniteCorrections } from '../../../packages/component-composition-corpus/test-support/physics-force-recovery-journey.mjs';
import { describe, expect, it } from 'vitest';
import { createPhysicsWorld } from './world.js';

describe('finite physics integration', () => {
	it.each(['sum', 'division'] as const)('rejects non-finite %s results and recovers', (kind) => {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		try {
			const body = world.createBody({
				shape: { kind: 'circle', radius: 1 },
				mass: kind === 'division' ? 1e-10 : 1
			});
			let large = true;
			world.addForce({ name: 'first', apply: () => ({ x: large ? 1e308 : 1, y: 0 }) });
			if (kind === 'sum')
				world.addForce({ name: 'second', apply: () => ({ x: large ? 1e308 : 1, y: 0 }) });
			expect(() => world.step(1)).toThrow(/finite/);
			expect(body.velocity.x).toBe(0);
			expect(world.time).toBe(0);
			large = false;
			world.step(0);
			expect(Number.isFinite(body.velocity.x)).toBe(true);
			expect(world.time).toBe(1);
		} finally {
			world[Symbol.dispose]();
		}
	});
});

describe('finite physics corrections and queued commands', () => {
	it('shares numeric failure, rollback and repair controls across public packages', () => {
		expect(verifyPhysicsFiniteCorrections({ createPhysicsWorld })).toBe(true);
	});
});
