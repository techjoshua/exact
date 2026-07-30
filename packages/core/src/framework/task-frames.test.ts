import { describe, expect, it } from 'vitest';

import {
	captureTaskFrame,
	reserveTaskFrame,
	runTaskFrame,
	runWithTaskFrame
} from './task-frames.js';

describe('framework task frame SPI', () => {
	it('keeps tokens opaque and restores synchronous ambient context', async () => {
		let token: ReturnType<typeof captureTaskFrame>;
		await runTaskFrame(
			{ kind: 'test', label: 'root' },
			{
				work() {
					token = captureTaskFrame();
					expect(token).toBeDefined();
				}
			}
		);
		expect(captureTaskFrame()).toBeUndefined();
		expect(() => runWithTaskFrame(token!, () => undefined)).toThrow('settled');
	});

	it('reserves descendants atomically before scheduler handoff', async () => {
		const order: string[] = [];
		let runReserved!: () => Promise<void>;
		const parent = runTaskFrame(
			{ kind: 'test' },
			{
				work() {
					const reservation = reserveTaskFrame({ kind: 'scheduled' });
					runReserved = () =>
						reservation.run(async () => {
							order.push('child');
						});
					order.push('parent-body');
				},
				afterChildren() {
					order.push('parent-settled');
				}
			}
		);
		await Promise.resolve();
		expect(order).toEqual(['parent-body']);
		await runReserved();
		await parent;
		expect(order).toEqual(['parent-body', 'child', 'parent-settled']);
	});

	it('reports foreground and structural outcomes exactly once', async () => {
		const foreground: string[] = [];
		const structural: string[] = [];
		await expect(
			runTaskFrame(
				{ kind: 'test' },
				{
					work() {
						throw new Error('broken');
					},
					afterForeground(outcome) {
						foreground.push(outcome.status);
					},
					afterChildren(outcome) {
						structural.push(outcome.status);
					}
				}
			)
		).rejects.toThrow('broken');
		expect(foreground).toEqual(['rejected']);
		expect(structural).toEqual(['rejected']);
	});
});
