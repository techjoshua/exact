import { runTaskFrame } from '@exactjs/core/framework/task-frames';
import { taskAwait } from '@exactjs/core/runtime/tasks';
import {
	createEffectScope,
	scheduleWork,
	withEffectScope
} from '@exactjs/reactive/framework/runtime';
import { flushSync, reactive, watch } from '@exactjs/reactive';

/** Verifies scope parking after a flush has already selected its callbacks. */
export function probePausedWork() {
	const scope = createEffectScope();
	const state = reactive({ value: 0 });
	const values: number[] = [];
	const computations: number[] = [];
	const stop = watch(() => {
		if (state.value === 1) scope.pause();
	});
	try {
		withEffectScope(scope, () => watch(() => values.push(state.value)));
		state.value = 1;
		flushSync();
		const parkedValues = [...values];
		state.value = 2;
		scope.resume();
		flushSync();
		scheduleWork(() => scope.pause());
		scheduleWork(() => computations.push(state.value), 'normal', undefined, scope);
		flushSync();
		const parkedComputations = [...computations];
		scope.resume();
		flushSync();
		state.value = 3;
		flushSync();
		return { parkedValues, values, parkedComputations, computations };
	} finally {
		stop();
		scope.stop();
	}
}

/** Exercises compiler await helpers when cancellation settles a frame ahead of its queued resumption. */
export async function probeQueuedAwaits() {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const completed: number[] = [];
	const executions = Array.from({ length: 12 }, (_, index) =>
		runTaskFrame(
			{ kind: 'queued-await' },
			{
				async work(context) {
					await taskAwait(context.signal, gate);
					completed.push(index);
				}
			}
		)
	);
	const results = Promise.allSettled(executions);
	release();
	queueMicrotask(() => executions.at(-1)!.cancel('superseded'));
	const statuses = (await results).map((result) => result.status);
	await new Promise((resolve) => setTimeout(resolve, 0));
	await runTaskFrame(
		{ kind: 'next-await' },
		{
			async work(context) {
				await taskAwait(context.signal, Promise.resolve());
				completed.push(12);
			}
		}
	);
	return { statuses, completed };
}
