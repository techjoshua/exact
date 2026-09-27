import { reactive } from '@exactjs/reactive';
import { bindTask, createTaskOwner, defineTask } from '@exactjs/core/tasks';

/** Exercises independent task rejection, moved entries, and a subsequent successful edit. */
export async function optimisticStateJourney() {
	const state = reactive({ value: 'base', items: ['base'] });
	const owner = createTaskOwner();
	const failures = [];
	const tasks = ['first', 'second'].map((value) =>
		bindTask(
			defineTask({ concurrency: 'latest' }, async (context) => {
				context.optimistic(() => {
					state.value = value;
					state.items.push(value);
				});
				await new Promise((_, reject) => failures.push(reject));
			}),
			{ owner }
		)
	);
	try {
		const pending = tasks.map((task) =>
			Promise.resolve(task()).catch((error) => {
				if (error.message !== 'expected rejection') throw error;
			})
		);
		while (failures.length < 2) await new Promise((resolve) => setTimeout(resolve, 0));
		failures[0](new Error('expected rejection'));
		await pending[0];
		failures[1](new Error('expected rejection'));
		await pending[1];
		const restored = { value: state.value, items: [...state.items] };
		const next = bindTask(
			defineTask({ concurrency: 'latest' }, (context) => {
				context.optimistic(() => {
					state.value = 'saved';
					state.items.push('saved');
				});
			}),
			{ owner }
		);
		await next();
		return {
			restored,
			current: { value: state.value, items: [...state.items] },
			pending: tasks.map((task) => task.pendingCount)
		};
	} finally {
		await owner[Symbol.asyncDispose]();
	}
}
