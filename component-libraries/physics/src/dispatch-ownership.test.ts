import { describe, expect, it } from 'vitest';
import { createPhysicsWorld } from './world.js';

describe('physics dispatch ownership', () => {
	it.each(['body', 'world'] as const)('fences coordinate getters that dispose the %s', (kind) => {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		try {
			const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
			let later = 0;
			world.addForce({
				name: 'getter',
				apply: () => ({
					get x() {
						(kind === 'body' ? body : world)[Symbol.dispose]();
						return 1;
					},
					y: 0
				})
			});
			world.addForce({
				name: 'later',
				apply() {
					later++;
				}
			});
			const result = world.step(1);
			expect(body.velocity.x).toBe(0);
			expect(later).toBe(0);
			expect(result.steps).toBe(kind === 'world' ? 0 : 1);
		} finally {
			world[Symbol.dispose]();
		}
	});

	it.each(['contributor', 'body', 'world'] as const)(
		'fences work after callback-time %s disposal',
		(kind) => {
			const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
			try {
				const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
				const calls: string[] = [];
				world.addForce({
					name: 'first',
					apply() {
						calls.push('first');
						if (kind === 'contributor') second[Symbol.dispose]();
						if (kind === 'body') body[Symbol.dispose]();
						if (kind === 'world') world[Symbol.dispose]();
						return { x: 1, y: 0 };
					}
				});
				const second = world.addForce({
					name: 'second',
					apply() {
						calls.push('second');
						return { x: 1, y: 0 };
					}
				});
				const result = world.step(1);
				expect(calls).toEqual(['first']);
				expect(body.velocity.x).toBe(kind === 'contributor' ? 1 : 0);
				expect(result.steps).toBe(kind === 'world' ? 0 : 1);
			} finally {
				world[Symbol.dispose]();
			}
		}
	);

	it('starts a registration made during dispatch on the next fixed tick without repeating its producer', () => {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		try {
			const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
			let calls = 0;
			world.addForce({
				name: 'producer',
				apply() {
					if (++calls === 1)
						world.addForce({ name: 'new-first', order: -1, apply: () => ({ x: 2, y: 0 }) });
					return { x: 1, y: 0 };
				}
			});
			world.step(1);
			expect(calls).toBe(1);
			expect(body.velocity.x).toBe(1);
			world.step(1);
			expect(calls).toBe(2);
			expect(body.velocity.x).toBe(4);
		} finally {
			world[Symbol.dispose]();
		}
	});
});
