import { describe, expect, it } from 'vitest';
import { createPhysicsWorld } from './world.js';

function collisionWorld() {
	const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
	world.createBody({ type: 'static', shape: { kind: 'circle', radius: 2 } });
	world.createBody({ shape: { kind: 'circle', radius: 2 }, position: { x: 3, y: 0 } });
	return world;
}

describe('collision subscription ownership', () => {
	it('skips a subscription removed by an earlier callback in the same batch', () => {
		const world = collisionWorld();
		try {
			const calls: string[] = [];
			world.onCollision(() => {
				calls.push('first');
				second[Symbol.dispose]();
			});
			const second = world.onCollision(() => {
				calls.push('second');
			});
			world.step(1);
			expect(calls).toEqual(['first']);
		} finally {
			world[Symbol.dispose]();
		}
	});

	it('owns repeated registrations of the same callback independently', () => {
		const world = collisionWorld();
		try {
			let calls = 0;
			const listener = () => {
				calls++;
			};
			const first = world.onCollision(listener);
			const second = world.onCollision(listener);
			first[Symbol.dispose]();
			world.step(1);
			expect(calls).toBe(1);
			second[Symbol.dispose]();
			world.step(1);
			expect(calls).toBe(1);
		} finally {
			world[Symbol.dispose]();
		}
	});
});
