import { describe, expect, it, vi } from 'vitest';
import { createTaskOwner } from './owners.js';
import { createTaskProgressReceiver } from './progress-receiver.js';
import { stageTaskMutation, taskAwait } from './resources.js';

function gate() {
	let resolve!: () => void;
	const promise = new Promise<void>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

describe('invocation-scoped progress receivers', () => {
	it('finishes active async work then processes only the latest pending snapshot', async () => {
		await using owner = createTaskOwner();
		const signal = new AbortController().signal;
		const held = gate();
		const started: number[] = [];
		const published: number[] = [];
		const onError = vi.fn();
		const receiver = createTaskProgressReceiver({
			owner,
			signal,
			label: 'progress',
			onError,
			async receive(value: number, task) {
				started.push(value);
				if (value === 1) await taskAwait(task.signal, held.promise);
				stageTaskMutation(task.signal, () => published.push(value));
			}
		});
		receiver.report(1);
		await vi.waitFor(() => expect(started).toEqual([1]));
		receiver.report(2);
		receiver.report(3);
		expect(published).toEqual([]);
		held.resolve();
		await vi.waitFor(() => expect(published).toEqual([1, 3]));
		expect(started).toEqual([1, 3]);
		expect(onError).not.toHaveBeenCalled();
		receiver.close();
	});

	it.each(['complete', 'abort', 'dispose'])(
		'fences active and pending work on %s without waiting for its body',
		async (ending) => {
			const owner = createTaskOwner();
			const controller = new AbortController();
			const held = gate();
			const cleanup = vi.fn();
			const published = vi.fn();
			const onError = vi.fn();
			const started = vi.fn();
			const receiver = createTaskProgressReceiver({
				owner,
				signal: controller.signal,
				label: 'progress',
				onError,
				async receive(value: number, task) {
					started(value);
					task.cleanup(cleanup);
					stageTaskMutation(task.signal, published);
					await taskAwait(task.signal, held.promise);
					stageTaskMutation(task.signal, published);
				}
			});
			receiver.report(1);
			await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
			receiver.report(2);
			if (ending === 'complete') receiver.close();
			else if (ending === 'abort') controller.abort('superseded');
			else await owner[Symbol.asyncDispose]();
			await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
			receiver.report(3);
			held.resolve();
			await owner[Symbol.asyncDispose]();
			expect(started).toHaveBeenCalledOnce();
			expect(published).not.toHaveBeenCalled();
			expect(onError).not.toHaveBeenCalled();
		}
	);

	it('discards failed writes, reports the error, and continues with a pending snapshot', async () => {
		await using owner = createTaskOwner();
		const held = gate();
		const failure = new Error('receiver failed');
		const published: number[] = [];
		const started = vi.fn();
		const onError = vi.fn();
		const receiver = createTaskProgressReceiver({
			owner,
			signal: new AbortController().signal,
			label: 'progress',
			onError,
			async receive(value: number, task) {
				started(value);
				stageTaskMutation(task.signal, () => published.push(value));
				if (value === 1) {
					await held.promise;
					throw failure;
				}
			}
		});
		receiver.report(1);
		await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
		receiver.report(2);
		held.resolve();
		await vi.waitFor(() => expect(published).toEqual([2]));
		expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
		receiver.close();
	});
});

it('closing one invocation does not cancel a sibling receiver on the same component', async () => {
	await using owner = createTaskOwner();
	const held = gate();
	const published: number[] = [];
	const makeLane = () =>
		createTaskProgressReceiver({
			owner,
			signal: new AbortController().signal,
			label: 'shared receiver',
			onError: (error) => {
				throw error;
			},
			async receive(value: number, task) {
				await taskAwait(task.signal, held.promise);
				stageTaskMutation(task.signal, () => published.push(value));
			}
		});
	const first = makeLane();
	const second = makeLane();
	first.report(1);
	second.report(2);
	first.close();
	held.resolve();
	await vi.waitFor(() => expect(published).toEqual([2]));
	second.report(3);
	await vi.waitFor(() => expect(published).toEqual([2, 3]));
	second.close();
});
