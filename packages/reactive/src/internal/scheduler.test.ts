import { describe, expect, it, vi } from 'vitest';
import { watch } from '../observation.js';
import { reactive } from '../reactive.js';
import {
	currentWorkPriority,
	flushSync,
	inspectScheduledWork,
	queueComputation,
	runWithPriority
} from './scheduler.js';

describe('reactive scheduler computation errors', () => {
	it('routes each queued computation failure to the handler retained with that computation', () => {
		const first = new Error('first');
		const second = new Error('second');
		const firstHandler = vi.fn();
		const secondHandler = vi.fn();
		queueComputation(() => {
			throw first;
		}, firstHandler);
		queueComputation(() => {
			throw second;
		}, secondHandler);

		expect(() => flushSync()).not.toThrow();
		expect(firstHandler).toHaveBeenCalledWith(first);
		expect(secondHandler).toHaveBeenCalledWith(second);
	});

	it('continues draining and rethrows the first unhandled computation failure', () => {
		const ran = vi.fn();
		queueComputation(() => {
			throw new Error('unhandled');
		});
		queueComputation(ran);

		expect(() => flushSync()).toThrow('unhandled');
		expect(ran).toHaveBeenCalledOnce();
	});
});

describe('reactive scheduler priorities', () => {
	it('drains foreground work without prematurely running deferred work', () => {
		const order: string[] = [];

		runWithPriority('deferred', () =>
			queueComputation(() => order.push(`deferred:${currentWorkPriority()}`))
		);
		runWithPriority('normal', () =>
			queueComputation(() => order.push(`normal:${currentWorkPriority()}`))
		);
		runWithPriority('interactive', () =>
			queueComputation(() => order.push(`interactive:${currentWorkPriority()}`))
		);

		flushSync('normal');
		expect(order).toEqual(['interactive:interactive', 'normal:normal']);

		flushSync();
		expect(order).toEqual(['interactive:interactive', 'normal:normal', 'deferred:deferred']);
	});

	it('promotes duplicate queued work instead of scheduling a second execution', () => {
		const order: string[] = [];
		const promoted = vi.fn(() => order.push(`promoted:${currentWorkPriority()}`));

		runWithPriority('deferred', () => queueComputation(promoted));
		runWithPriority('normal', () =>
			queueComputation(() => order.push(`normal:${currentWorkPriority()}`))
		);
		runWithPriority('interactive', () => queueComputation(promoted));

		flushSync('normal');

		expect(promoted).toHaveBeenCalledOnce();
		expect(order).toEqual(['promoted:interactive', 'normal:normal']);
	});

	it('promotes a queued reaction when a newer invalidation is interactive', () => {
		const state = reactive({ value: 0 });
		const observations: string[] = [];
		watch(() => observations.push(`${state.value}:${currentWorkPriority()}`));

		runWithPriority('deferred', () => {
			state.value = 1;
		});
		flushSync('normal');
		expect(observations).toEqual(['0:normal']);

		runWithPriority('interactive', () => {
			state.value = 2;
		});
		flushSync('normal');

		expect(observations).toEqual(['0:normal', '2:interactive']);
		flushSync();
		expect(observations).toEqual(['0:normal', '2:interactive']);
	});

	it('eventually drains deferred work during a sustained sequence of foreground turns', async () => {
		const deferred = vi.fn();
		runWithPriority('deferred', () => queueComputation(deferred));

		for (let turn = 0; turn < 8; turn++) {
			queueComputation(() => undefined, undefined, 'normal');
			await Promise.resolve();
		}

		expect(deferred).toHaveBeenCalledOnce();
	});

	it('exposes queued priorities without executing scheduler work', () => {
		const deferred = vi.fn();
		runWithPriority('deferred', () => queueComputation(deferred));

		expect(inspectScheduledWork()).toMatchObject({
			currentPriority: 'normal',
			computations: { deferred: 1 },
			reactions: { deferred: 0 }
		});
		expect(deferred).not.toHaveBeenCalled();

		flushSync();
	});
});
