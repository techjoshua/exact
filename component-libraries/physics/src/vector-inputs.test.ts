import { expect, it } from 'vitest';
import { createPhysicsWorld } from './world.js';
import { finiteVector } from './math.js';

it('copies the coordinates it validated without reading accessors again', () => {
	let reads = 0;
	const value = {
		get x() {
			return ++reads === 1 ? 1 : Number.POSITIVE_INFINITY;
		},
		y: 2
	};
	expect(finiteVector(value, 'input')).toEqual({ x: 1, y: 2 });
	expect(reads).toBe(1);
});

it('rejects an invalid first coordinate before evaluating the next accessor', () => {
	let reads = 0;
	expect(() =>
		finiteVector(
			{
				x: Number.NaN,
				get y(): number {
					reads++;
					throw new Error('later getter');
				}
			},
			'input'
		)
	).toThrow('finite coordinates');
	expect(reads).toBe(0);
});

it('uses the same captured coordinates for force contribution and queued commands', () => {
	const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
	try {
		let reads = 0;
		const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
		body.applyForce({
			get x() {
				return ++reads === 1 ? 1 : Number.POSITIVE_INFINITY;
			},
			y: 0
		});
		world.step(1);
		expect(body.velocity.x).toBe(1);
		expect(reads).toBe(1);
	} finally {
		world[Symbol.dispose]();
	}
});
