import { expect, it } from 'vitest';
import { executeTaskFrame } from './frame-runtime.js';
import { executeServerComponentTaskSlice } from './server-component-task-slice.js';
import { taskNativeCleanupScope } from './native-cleanup-scope.js';
import { taskAwait } from './resources.js';
import type { TaskContext } from './contracts.js';

it.each(['frame', 'slice'] as const)(
	'awaits native lexical cleanup before a cancelled generation settles: %s',
	async (mode) => {
		const owner = new AbortController();
		let dispose!: () => void;
		let started = 0;
		let released = 0;
		let settled = false;
		const work = async (task: TaskContext) => {
			const finish = taskNativeCleanupScope(task.signal);
			try {
				await using resource = {
					async [Symbol.asyncDispose]() {
						started++;
						await new Promise<void>((resolve) => {
							dispose = resolve;
						});
						released++;
					}
				};
				void resource;
				await taskAwait(task.signal, new Promise<void>(() => {}));
			} finally {
				finish();
			}
		};
		const result =
			mode === 'frame'
				? executeTaskFrame({ controller: owner }, work)
				: executeServerComponentTaskSlice<[], void>(owner.signal, undefined, work, []);
		const observed = result.catch(() => {
			settled = true;
		});
		owner.abort('cancel');
		await expect.poll(() => started).toBe(1);
		expect(settled).toBe(false);
		dispose();
		await observed;
		expect(settled).toBe(true);
		expect(released).toBe(1);
	}
);
