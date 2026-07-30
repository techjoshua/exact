import { describe, expect, it, vi } from 'vitest';
import { computed, currentWorkPriority, flushSync, reactive, watch } from '@exactjs/reactive';

import type { TaskContext } from './contracts.js';
import { activateTask } from './activation.js';
import { createTaskOwnerRecord, withTaskOwnerRecord } from './frame-runtime.js';
import { createTaskOwner } from './owners.js';
import { bindTask, defineTask, invokeTask, taskStatus } from './runtime.js';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise, resolve, reject };
}

describe('unified task runtime', () => {
	it('defines thenable tasks and settles attached descendants before the parent', async () => {
		const order: string[] = [];
		const childGate = deferred<void>();
		const child = defineTask({}, async () => {
			await childGate.promise;
			order.push('child');
			return 2;
		});
		const parent = defineTask({}, (_task: TaskContext) => {
			void child();
			order.push('parent-body');
			return 1;
		});

		const invocation = parent();
		expect(invocation).not.toBeInstanceOf(Promise);
		await Promise.resolve();
		await Promise.resolve();
		expect(order).toEqual(['parent-body']);
		childGate.resolve();
		await expect(invocation).resolves.toBe(1);
		expect(order).toEqual(['parent-body', 'child']);
	});

	it('restores explicit attachment after suspension and cleans up child-first in LIFO order', async () => {
		const order: string[] = [];
		const child = defineTask({}, (_task: TaskContext) => {
			_task.cleanup(() => {
				order.push('child-first');
			});
			return undefined;
		});
		const parent = defineTask({}, async (task: TaskContext) => {
			task.cleanup(() => {
				order.push('parent-first');
			});
			task.cleanup(() => {
				order.push('parent-last');
			});
			await Promise.resolve();
			await invokeTask(task, child);
		});

		await parent();
		expect(order).toEqual(['child-first', 'parent-last', 'parent-first']);
	});

	it('propagates unobserved child failure and permits ordinary caught recovery', async () => {
		const child = defineTask({}, () => {
			throw new Error('child failed');
		});
		const unobserved = defineTask({}, () => {
			void child();
			return 'body completed';
		});
		const recovered = defineTask({}, async () => {
			await child().catch(() => undefined);
			return 'recovered';
		});

		await expect(unobserved()).rejects.toThrow('child failed');
		await expect(recovered()).resolves.toBe('recovered');
	});

	it('settles scheduled reactive consequences before frame cleanup', async () => {
		const state = reactive({ value: 0 });
		const order: string[] = [];
		const stop = watch(() => {
			order.push(`render:${state.value}`);
		});
		const task = defineTask({}, (context: TaskContext) => {
			context.cleanup(() => {
				order.push('cleanup');
			});
			state.value++;
		});

		await task();
		expect(order).toEqual(['render:0', 'render:1', 'cleanup']);
		stop();
	});

	it('inherits priority and donates an awaiting parent priority to queued result work', async () => {
		const observed: string[] = [];
		const inherited = defineTask({}, () => {
			observed.push(currentWorkPriority());
		});
		const deferredChild = defineTask({ priority: 'deferred' }, () => {
			observed.push(currentWorkPriority());
		});
		const parent = defineTask({ priority: 'immediate' }, async (task: TaskContext) => {
			await invokeTask(task, inherited);
			await invokeTask(task, deferredChild);
		});

		await parent();
		expect(observed).toEqual(['interactive', 'interactive']);
	});

	it('preserves task identity when an owner-bound function is invoked as a child', async () => {
		const owner = createTaskOwner();
		const child = bindTask(
			defineTask({}, (value: number, _task: TaskContext) => value * 2),
			{ owner }
		);
		const parent = defineTask({ owner }, (task: TaskContext) => invokeTask(task, child, 3));

		await expect(parent()).resolves.toBe(6);
		await owner[Symbol.asyncDispose]();
	});

	it('reproduces compiler setup activation through the public ABI', async () => {
		const owner = createTaskOwnerRecord('activation test');
		const state = reactive({ value: 1 });
		const activations: string[] = [];
		const task = defineTask({ concurrency: 'latest' }, (value: number, context: TaskContext) => {
			activations.push(`${context.activation}:${value}`);
		});
		const activation = withTaskOwnerRecord(owner, () =>
			activateTask(
				task,
				computed(() => state.value)
			)
		);
		flushSync();
		await Promise.resolve();

		state.value = 2;
		flushSync();
		await Promise.resolve();
		flushSync();
		await Promise.resolve();

		expect(activations).toEqual(['initialization:1', 'reactive:2']);
		activation[Symbol.dispose]();
		await owner[Symbol.asyncDispose]();
	});

	it('captures omitted task arguments once per generation without subscribing to them', async () => {
		const owner = createTaskOwnerRecord('captured argument test');
		const state = reactive({ trigger: 1, snapshot: 'first' });
		const observed: string[] = [];
		const task = defineTask(
			{
				concurrency: 'latest',
				captureArguments(args) {
					return [args[0], args[1] === undefined ? state.snapshot : args[1]] as [number, string];
				}
			},
			(trigger: number, snapshot: string, _context: TaskContext) => {
				observed.push(`${trigger}:${snapshot}`);
			}
		);
		const activation = withTaskOwnerRecord(owner, () =>
			activateTask(
				task,
				computed(() => state.trigger),
				undefined as unknown as string
			)
		);
		flushSync();
		await Promise.resolve();

		state.snapshot = 'second';
		flushSync();
		await Promise.resolve();
		expect(observed).toEqual(['1:first']);

		state.trigger = 2;
		flushSync();
		await Promise.resolve();
		flushSync();
		await Promise.resolve();
		expect(observed).toEqual(['1:first', '2:second']);

		activation[Symbol.dispose]();
		await owner[Symbol.asyncDispose]();
	});

	it('uses explicit task arguments instead of captured defaults', async () => {
		const state = reactive({ snapshot: 'default' });
		const task = defineTask(
			{
				captureArguments(args) {
					return [args[0] === undefined ? state.snapshot : args[0]] as [string];
				}
			},
			(snapshot: string, _context: TaskContext) => snapshot
		);

		await expect(task('explicit')).resolves.toBe('explicit');
		await expect(task(undefined as unknown as string)).resolves.toBe('default');
	});

	it('isolates latest concurrency by durable owner', async () => {
		const firstOwner = createTaskOwner();
		const secondOwner = createTaskOwner();
		const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
		let index = 0;
		const task = defineTask(
			{ concurrency: 'latest' },
			async (_value: string, _task: TaskContext) => {
				return gates[index++]!.promise;
			}
		);
		const first = bindTask(task, { owner: firstOwner });
		const second = bindTask(task, { owner: secondOwner });

		const superseded = first('old');
		const current = first('new');
		const isolated = second('other');
		gates[0]!.resolve('new');
		gates[1]!.resolve('other');

		await expect(superseded).rejects.toMatchObject({ name: 'AbortError' });
		await expect(current).resolves.toBe('new');
		await expect(isolated).resolves.toBe('other');
		await firstOwner[Symbol.asyncDispose]();
		await secondOwner[Symbol.asyncDispose]();
	});

	it('queues generations and exposes owner-bound status', async () => {
		const owner = createTaskOwner();
		const gates = [deferred<number>(), deferred<number>()];
		let index = 0;
		const task = defineTask({ concurrency: 'queue' }, () => gates[index++]!.promise);
		const bound = bindTask(task, { owner });
		const status = taskStatus(task, { owner });

		const first = bound();
		const second = bound();
		await Promise.resolve();
		expect(bound.pending).toBe(true);
		expect(status.pendingCount).toBe(2);
		gates[0]!.resolve(1);
		await expect(first).resolves.toBe(1);
		await Promise.resolve();
		expect(status.pendingCount).toBe(1);
		gates[1]!.resolve(2);
		await expect(second).resolves.toBe(2);
		expect(status.pending).toBe(false);
		expect(status.result).toBe(2);
		expect(status.generation).toBe(2);
		await owner[Symbol.asyncDispose]();
	});

	it('rolls optimistic mutations back on failure and rejects async optimistic callbacks', async () => {
		const state = reactive({ value: 'before' });
		const task = defineTask({ concurrency: 'latest' }, async (context: TaskContext) => {
			context.optimistic(() => {
				state.value = 'optimistic';
			});
			throw new Error('failed');
		});
		await expect(task()).rejects.toThrow('failed');
		expect(state.value).toBe('before');

		const invalid = defineTask({ concurrency: 'latest' }, (context: TaskContext) => {
			context.optimistic(async () => undefined);
		});
		await expect(invalid()).rejects.toThrow('requires a synchronous callback');
	});

	it('cancels every generation when its owner is disposed', async () => {
		const owner = createTaskOwner();
		const work = vi.fn(
			(context: TaskContext) =>
				new Promise<void>((_resolve, reject) => {
					context.signal.addEventListener('abort', () => reject(context.signal.reason));
				})
		);
		const task = bindTask(defineTask({}, work), { owner });
		const invocation = task();
		await Promise.resolve();
		await owner[Symbol.asyncDispose]();
		await expect(invocation).rejects.toMatchObject({
			name: 'AbortError',
			reason: 'task-owner-disposed'
		});
		expect(work.mock.calls.length).toBeLessThanOrEqual(1);
	});
});
