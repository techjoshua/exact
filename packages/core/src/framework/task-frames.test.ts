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

	it('does not repeat a structural finalizer that fails', async () => {
		const structural: string[] = [];
		await expect(
			runTaskFrame(
				{ kind: 'test' },
				{
					work: () => 'complete',
					afterChildren(outcome) {
						structural.push(outcome.status);
						throw new Error('finalizer failed');
					}
				}
			)
		).rejects.toThrow('finalizer failed');
		expect(structural).toEqual(['fulfilled']);
	});

	it('does not retroactively cancel settled framework work', async () => {
		const execution = runTaskFrame(
			{ kind: 'test' },
			{
				work: () => 'complete'
			}
		);
		await execution;
		execution.cancel('too-late');
		expect(execution.signal.aborted).toBe(false);
	});

	it('cancels foreground work and every attached descendant', async () => {
		const foreground: string[] = [];
		const structural: string[] = [];
		const cleanup: string[] = [];
		let childSignal!: AbortSignal;
		let reportChildStarted!: () => void;
		const childStarted = new Promise<void>((resolve) => {
			reportChildStarted = resolve;
		});
		const execution = runTaskFrame(
			{ kind: 'presence-leave' },
			{
				async work(task) {
					task.cleanup(() => cleanup.push('parent'));
					await runTaskFrame(
						{ kind: 'motion' },
						{
							async work(child) {
								childSignal = child.signal;
								child.cleanup(() => cleanup.push('child'));
								reportChildStarted();
								await rejectWhenAborted(child.signal);
							}
						}
					);
				},
				afterForeground(outcome) {
					foreground.push(outcome.status);
				},
				afterChildren(outcome) {
					structural.push(outcome.status);
				}
			}
		);

		await childStarted;
		execution.cancel('presence-restored');
		execution.cancel('ignored-second-reason');

		expect(execution.signal.aborted).toBe(true);
		expect(execution.signal.reason).toBe('presence-restored');
		expect(childSignal.aborted).toBe(true);
		await expect(execution).rejects.toMatchObject({
			name: 'AbortError',
			reason: 'presence-restored'
		});
		expect(foreground).toEqual(['cancelled']);
		expect(structural).toEqual(['cancelled']);
		expect(cleanup).toEqual(['child', 'parent']);
	});

	it('reports ready foreground before cancellation during descendant settlement', async () => {
		const foreground: string[] = [];
		const structural: string[] = [];
		const cleanup: string[] = [];
		let reportForeground!: () => void;
		const foregroundReady = new Promise<void>((resolve) => {
			reportForeground = resolve;
		});
		const execution = runTaskFrame(
			{ kind: 'presence-leave' },
			{
				work(task) {
					task.cleanup(() => cleanup.push('parent'));
					void runTaskFrame(
						{ kind: 'motion' },
						{
							async work(child) {
								child.cleanup(() => cleanup.push('child'));
								await rejectWhenAborted(child.signal);
							}
						}
					).catch(() => undefined);
					return 'retained-range';
				},
				afterForeground(outcome) {
					foreground.push(outcome.status);
					reportForeground();
				},
				afterChildren(outcome) {
					structural.push(outcome.status);
				}
			}
		);

		await foregroundReady;
		execution.cancel('presence-restored');

		await expect(execution).rejects.toMatchObject({
			name: 'AbortError',
			reason: 'presence-restored'
		});
		expect(foreground).toEqual(['ready']);
		expect(structural).toEqual(['cancelled']);
		expect(cleanup).toEqual(['child', 'parent']);
	});
});

/** Rejects cooperatively when task-frame cancellation reaches asynchronous work. */
function rejectWhenAborted(signal: AbortSignal): Promise<never> {
	return new Promise((_, reject) => {
		if (signal.aborted) {
			reject(new Error('aborted'));
			return;
		}
		signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
	});
}
