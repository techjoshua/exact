import { describe, expect, it, vi } from 'vitest';
import { computed, currentWorkPriority, flushSync, reactive, watch } from '@exactjs/reactive';

import type { TaskContext } from './contracts.js';
import type { Component } from '../component/contracts.js';
import { LoggerContext } from '../component/contexts.js';
import { createFrameworkFixtureComponentInstance } from '../component/runtime.js';
import { runTaskFrame } from '../framework/task-frames.js';
import type { LogEvent, Logger } from '../logging.js';
import { activateTask } from './activation.js';
import { activateComputationForHost } from './computation-activation.js';
import { createTrackedContinuationDependency } from './dependency-source.js';
import {
	createTaskOwnerRecord,
	currentTaskFrameRecord,
	resumeTaskFrame,
	withTaskOwnerRecord
} from './frame-runtime.js';
import { createTaskOwner } from './owners.js';
import { registerTaskOwnerHost } from './owner-hosts.js';
import { bindTask, bindTaskForHost, defineTask, invokeTask, taskStatus } from './runtime.js';

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
	it('runs compiler-owned computations without creating task generations', () => {
		const owner = createTaskOwnerRecord('computation');
		const host = {};
		registerTaskOwnerHost(host, owner);
		const state = reactive({ value: 1 });
		const values: number[] = [];
		const activation = activateComputationForHost(
			host,
			(value: number, context) => {
				expect(context.signal.aborted).toBe(false);
				values.push(value);
			},
			computed(() => state.value)
		);

		expect(values).toEqual([1]);
		expect(owner.frames.size).toBe(0);
		state.value = 2;
		flushSync();
		expect(values).toEqual([1, 2]);
		expect(owner.frames.size).toBe(0);
		activation[Symbol.dispose]();
	});

	it('tracks compiler activation projections without constructing public computed values', () => {
		const owner = createTaskOwnerRecord('tracked-computation');
		const host = {};
		registerTaskOwnerHost(host, owner);
		const state = reactive({ branch: 'left' as 'left' | 'right', left: 1, right: 2 });
		const values: number[] = [];
		const dependency = createTrackedContinuationDependency(() =>
			state.branch === 'left' ? state.left % 2 : state.right % 2
		);
		const activation = activateComputationForHost(
			host,
			(value: number, _context) => values.push(value),
			dependency
		);

		expect(values).toEqual([1]);
		state.left = 3;
		flushSync();
		expect(values).toEqual([1]);
		state.branch = 'right';
		flushSync();
		expect(values).toEqual([1, 0]);
		state.left = 4;
		flushSync();
		expect(values).toEqual([1, 0]);
		state.right = 5;
		flushSync();
		expect(values).toEqual([1, 0, 1]);
		activation[Symbol.dispose]();
		state.right = 6;
		flushSync();
		expect(values).toEqual([1, 0, 1]);
	});

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

	it('shares one lightweight frame across a broad synchronous reactive invalidation wave', async () => {
		const state = reactive({ value: 0 });
		const scheduledFrameIds = new Set<number>();
		let parentFrameId: number | undefined;
		const stops = Array.from({ length: 100 }, () =>
			watch(() => {
				void state.value;
				const frame = currentTaskFrameRecord();
				if (frame) scheduledFrameIds.add(frame.id);
			})
		);
		const task = defineTask({}, () => {
			parentFrameId = currentTaskFrameRecord()?.id;
			state.value++;
		});

		await task();

		expect(scheduledFrameIds.size).toBe(1);
		expect([...scheduledFrameIds]).not.toEqual([parentFrameId]);
		for (const stop of stops) stop();
	});

	it('reuses the open producer for an interactive consequence wave', async () => {
		const state = reactive({ value: 0 });
		let parentFrameId: number | undefined;
		let consequenceFrameId: number | undefined;
		const stop = watch(() => {
			void state.value;
			consequenceFrameId = currentTaskFrameRecord()?.id;
		});
		const task = defineTask({ priority: 'immediate' }, () => {
			parentFrameId = currentTaskFrameRecord()?.id;
			state.value++;
			flushSync('interactive');
		});

		await task();

		expect(consequenceFrameId).toBe(parentFrameId);
		stop();
	});

	it('keeps presence work independently attached beneath the shared reactive frame', async () => {
		const state = reactive({ visible: false });
		const presenceStarted = deferred<void>();
		const presenceGate = deferred<void>();
		let consequenceFrameId: number | undefined;
		let presenceParentId: number | undefined;
		const stop = watch(() => {
			if (!state.visible) return;
			consequenceFrameId = currentTaskFrameRecord()?.id;
			void runTaskFrame(
				{ kind: 'presence-leave' },
				{
					async work() {
						presenceParentId = currentTaskFrameRecord()?.parent?.id;
						presenceStarted.resolve();
						await presenceGate.promise;
					}
				}
			);
		});
		const task = defineTask({}, () => {
			state.visible = true;
		});

		const execution = task();
		await presenceStarted.promise;
		let settled = false;
		void Promise.resolve(execution).then(() => {
			settled = true;
		});
		await Promise.resolve();

		expect(presenceParentId).toBe(consequenceFrameId);
		expect(settled).toBe(false);

		presenceGate.resolve();
		await execution;
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

	it('supersedes reactive generations independently of invoked concurrency policy', async () => {
		const owner = createTaskOwnerRecord('reactive supersession test');
		const state = reactive({ value: 1 });
		const started: number[] = [];
		const aborted: number[] = [];
		const task = defineTask(
			{ concurrency: 'parallel' },
			(value: number, context: TaskContext) =>
				new Promise<number>((resolve, reject) => {
					started.push(value);
					if (value === 2) resolve(value);
					context.signal.addEventListener('abort', () => {
						aborted.push(value);
						reject(context.signal.reason);
					});
				})
		);
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

		expect(started).toEqual([1, 2]);
		expect(aborted).toEqual([1]);
		activation[Symbol.dispose]();
		await owner[Symbol.asyncDispose]();
	});

	it('keeps a replacement activation independent of the generation it supersedes', async () => {
		const owner = createTaskOwnerRecord('continuation supersession test');
		const state = reactive({ value: 1 });
		const started: number[] = [];
		const first = deferred<void>();
		const task = defineTask({ concurrency: 'latest' }, (value: number, context: TaskContext) => {
			started.push(value);
			if (value !== 1) return;
			queueMicrotask(() =>
				resumeTaskFrame(context.signal, () => {
					state.value = 2;
					flushSync();
				})
			);
			return first.promise;
		});
		const activation = withTaskOwnerRecord(owner, () =>
			activateTask(
				task,
				computed(() => state.value)
			)
		);
		flushSync();
		await Promise.resolve();
		await Promise.resolve();
		flushSync();
		await Promise.resolve();

		expect(started).toEqual([1, 2]);
		activation[Symbol.dispose]();
		first.resolve();
		await owner[Symbol.asyncDispose]();
	});

	it('isolates dependency-driven concurrency by activation site', async () => {
		const owner = createTaskOwnerRecord('activation site test');
		const state = reactive({ left: 1, right: 2 });
		const signals: AbortSignal[] = [];
		const task = defineTask(
			{ concurrency: 'latest' },
			(_value: number, context: TaskContext) =>
				new Promise<void>((_resolve, reject) => {
					signals.push(context.signal);
					context.signal.addEventListener('abort', () => reject(context.signal.reason));
				})
		);
		const activations = withTaskOwnerRecord(owner, () => [
			activateTask(
				task,
				computed(() => state.left)
			),
			activateTask(
				task,
				computed(() => state.right)
			)
		]);
		flushSync();
		await Promise.resolve();

		expect(signals).toHaveLength(2);
		expect(signals.every((signal) => !signal.aborted)).toBe(true);
		for (const activation of activations) activation[Symbol.dispose]();
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

	it('aggregates keyed lanes while keeping key-scoped status isolated', async () => {
		const owner = createTaskOwner();
		const gates = new Map([
			['invoice', deferred<string>()],
			['receipt', deferred<string>()]
		]);
		const task = defineTask(
			{
				concurrency: 'latest',
				concurrencyKey: (documentId: string) => documentId
			},
			(documentId: string) => gates.get(documentId)!.promise
		);
		const bound = bindTask(task, { owner });
		const aggregate = taskStatus(task, { owner });
		const invoice = taskStatus(task, { owner, key: 'invoice' });
		const receipt = taskStatus(task, { owner, key: 'receipt' });

		const receiptInvocation = bound('receipt');
		expect(aggregate.pendingCount).toBe(1);
		expect(invoice.pending).toBe(false);
		expect(invoice.pendingCount).toBe(0);
		expect(invoice.generation).toBe(0);
		expect(invoice.result).toBeUndefined();
		expect(invoice.error).toBeUndefined();
		expect(receipt.pending).toBe(true);

		const invoiceInvocation = bound('invoice');
		expect(aggregate.pendingCount).toBe(2);
		expect(invoice.pendingCount).toBe(1);
		expect(receipt.pendingCount).toBe(1);

		gates.get('receipt')!.resolve('receipt saved');
		await expect(receiptInvocation).resolves.toBe('receipt saved');
		expect(aggregate.pendingCount).toBe(1);
		expect(invoice.pending).toBe(true);
		expect(invoice.result).toBeUndefined();
		expect(receipt.result).toBe('receipt saved');

		gates.get('invoice')!.resolve('invoice saved');
		await expect(invoiceInvocation).resolves.toBe('invoice saved');
		expect(aggregate.pending).toBe(false);
		expect(aggregate.result).toBe('invoice saved');
		expect(invoice.result).toBe('invoice saved');
		expect(receipt.result).toBe('receipt saved');
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

	it('traces component-owned task optimism and settlement only at trace level', async () => {
		const events: LogEvent[] = [];
		const logger: Logger = {
			isEnabled: (level) => level === 'trace',
			log: (event) => events.push(event)
		};
		const parent = createFrameworkFixtureComponentInstance(function Parent(this: Component<{}>) {
			this.setContext(LoggerContext, logger);
			return () => null;
		}, {});
		const owner = createFrameworkFixtureComponentInstance(() => () => null, {}, parent);
		const state = reactive({ value: 0 });
		const task = bindTaskForHost(
			owner,
			defineTask({ concurrency: 'latest', label: 'claim' }, (context: TaskContext) => {
				context.optimistic(() => state.value++);
				return state.value;
			})
		);

		await expect(task()).resolves.toBe(1);

		const traces = events
			.filter((event) => event.message.startsWith('performance task'))
			.map((event) => event.data as Record<string, unknown>);
		expect(traces.map((trace) => trace.phase)).toEqual([
			'started',
			'optimistic-applied',
			'settled'
		]);
		expect(new Set(traces.map((trace) => trace.operationId)).size).toBe(1);
		expect(traces[2]!.attributes).toEqual({ outcome: 'success' });
		parent.unmount();
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

	it('materializes an already-aborted signal when first observed after disposal', async () => {
		const owner = createTaskOwnerRecord('lazy owner');
		await owner[Symbol.asyncDispose]();
		expect(owner.signal.aborted).toBe(true);
		expect(owner.signal.reason).toBe('task-owner-disposed');
	});
});
import '../runtime/contexts.js';
import '../runtime/component-tasks.js';
