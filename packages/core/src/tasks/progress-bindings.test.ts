import { expect, it, vi } from 'vitest';
import { runTaskFrame } from '../framework/task-frames.js';
import { attachTaskProgressReporter, createTaskProgressReporter } from './progress-bindings.js';

it('requires explicit executor authority and fences retained producer callbacks after settlement', async () => {
	const report = vi.fn();
	let retained!: (snapshot: unknown) => void;
	await runTaskFrame(
		{ kind: 'server-continuation' },
		{
			work: async (task) => {
				attachTaskProgressReporter(task, report);
				createTaskProgressReporter('receiver')('SSR must not inherit ambient transport');
				retained = createTaskProgressReporter('receiver', task);
				await Promise.resolve();
				retained({ completed: 1 });
			}
		}
	);
	retained({ completed: 2 });
	expect(report).toHaveBeenCalledExactlyOnceWith('receiver', { completed: 1 });
});
