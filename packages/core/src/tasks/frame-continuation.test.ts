import { expect, it } from 'vitest';
import { taskAwait } from './resources.js';
import {
	currentTaskFrameRecord,
	executeTaskFrame,
	resumeTaskFrame,
	taskMutation
} from './frame-runtime.js';

it('drains queued resumptions when a later frame settles before its turn', async () => {
	const controllers = Array.from({ length: 12 }, () => new AbortController());
	const releases: Array<() => void> = [];
	const executions = controllers.map((controller) =>
		executeTaskFrame({ controller }, () => new Promise<void>((resolve) => releases.push(resolve)))
	);
	const cancelled = expect(executions.at(-1)!).rejects.toMatchObject({ name: 'AbortError' });
	const resumed: number[] = [];
	const completions = controllers.map(
		(controller, index) =>
			new Promise<void>((resolve) => {
				resumeTaskFrame(controller.signal, () => {
					resumed.push(index);
					if (index === controllers.length - 1) {
						expect(currentTaskFrameRecord()).toBeUndefined();
						expect(() =>
							taskMutation(controller.signal, () => {
								throw new Error('stale write');
							})
						).toThrow('superseded');
					}
					releases[index]!();
					resolve();
				});
			})
	);
	controllers.at(-1)!.abort('superseded');
	await cancelled;
	await Promise.all(completions);
	await Promise.all(executions.slice(0, -1));
	expect(resumed).toEqual(Array.from({ length: 12 }, (_, index) => index));
	expect(currentTaskFrameRecord()).toBeUndefined();
}, 2000);

it('settles cancelled compiler-style awaits and admits the next task', async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const controllers = Array.from({ length: 12 }, () => new AbortController());
	const completed: number[] = [];
	const executions = controllers.map((controller, index) =>
		executeTaskFrame({ controller }, async (context) => {
			await taskAwait(context.signal, gate);
			taskMutation(context.signal, () => completed.push(index));
		})
	);
	const results = Promise.allSettled(executions);
	release();
	queueMicrotask(() => controllers.at(-1)!.abort('superseded'));
	expect((await results).map((result) => result.status)).toEqual([
		...Array(11).fill('fulfilled'),
		'rejected'
	]);
	// Let pending cancellation delivery drain even after its public result rejects.
	await new Promise((resolve) => setTimeout(resolve, 0));
	await executeTaskFrame({}, async (context) => {
		await taskAwait(context.signal, Promise.resolve());
		completed.push(12);
	});
	expect(completed).toEqual([...Array.from({ length: 11 }, (_, index) => index), 12]);
});

it('restores ownership and drains later resumptions after a callback throws', async () => {
	const controllers = [new AbortController(), new AbortController()];
	const releases: Array<() => void> = [];
	const executions = controllers.map((controller) =>
		executeTaskFrame({ controller }, () => new Promise<void>((resolve) => releases.push(resolve)))
	);
	const failure = new Error('resumption failure');
	expect(() =>
		resumeTaskFrame(controllers[0]!.signal, () => {
			throw failure;
		})
	).toThrow(failure);
	const resumed = new Promise<void>((resolve) =>
		resumeTaskFrame(controllers[1]!.signal, () => {
			releases.forEach((release) => release());
			resolve();
		})
	);
	await resumed;
	await Promise.all(executions);
	expect(currentTaskFrameRecord()).toBeUndefined();
});
