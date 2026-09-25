import { expect, it } from 'vitest';
import { createTaskOwner } from './owners.js';
import { bindTask, defineTask } from './runtime.js';
import type { TaskContext } from './contracts.js';

it('cancels universal work disposed before its first scheduler turn', async () => {
	const owner = createTaskOwner();
	let calls = 0;
	const task = bindTask(
		defineTask({}, (_context: TaskContext) => {
			calls++;
		}),
		{ owner }
	);
	const invocation = task();
	const cancelled = expect(invocation).rejects.toMatchObject({ name: 'AbortError' });
	await owner[Symbol.asyncDispose]();
	await cancelled;
	expect(calls).toBe(0);
});

it('never starts a universal generation superseded before the scheduler turn', async () => {
	const owner = createTaskOwner();
	const calls: string[] = [];
	const task = bindTask(
		defineTask({ concurrency: 'latest' }, (value: string, _context: TaskContext) => {
			calls.push(value);
			return value;
		}),
		{ owner }
	);
	const old = task('old');
	const cancelled = expect(old).rejects.toMatchObject({ reason: 'superseded' });
	const current = task('current');
	await cancelled;
	await expect(current).resolves.toBe('current');
	expect(calls).toEqual(['current']);
	await owner[Symbol.asyncDispose]();
});
