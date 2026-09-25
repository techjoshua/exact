import { captureTaskFrame, runTaskFrame } from '@exactjs/core/framework/task-frames';
import { flushSync, reactive, watch } from '@exactjs/reactive';

/** Exercises cancellation and subsequent observations in the bundled runtime's own realm. */
export async function probeTaskCancellation() {
	const state = reactive({ value: 0 });
	const values: number[] = [];
	const owned: boolean[] = [];
	let cleanups = 0;
	const stop = watch(() => {
		values.push(state.value);
		owned.push(captureTaskFrame() !== undefined);
	});
	try {
		const execution = runTaskFrame(
			{ kind: 'progress' },
			{
				work(context) {
					context.cleanup(() => {
						cleanups++;
					});
					state.value = 1;
					return new Promise<void>((resolve) => {
						context.signal.addEventListener('abort', () => resolve(), { once: true });
					});
				}
			}
		);
		const outcome = execution.then(
			() => 'fulfilled',
			(error) => error.name
		);
		execution.cancel('superseded');
		state.value = 2;
		const result = await outcome;
		state.value = 3;
		flushSync();
		return { values, owned, cleanups, result };
	} finally {
		stop();
	}
}
