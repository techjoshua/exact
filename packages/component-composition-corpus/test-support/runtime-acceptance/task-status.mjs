import { bindTask, createTaskOwner, defineTask } from '@exactjs/core/tasks';

/** Captures status transitions under each readiness policy in the native host runtime. */
export async function taskStatusJourney() {
	const snapshots = [];
	for (const policy of [
		{ readiness: 'blocking', priority: 'normal' },
		{ readiness: 'nonblocking', priority: 'normal' },
		{ readiness: 'nonblocking', priority: 'deferred' }
	]) {
		const owner = createTaskOwner();
		let release;
		let started;
		const start = new Promise((resolve) => {
			started = resolve;
		});
		const task = bindTask(
			defineTask(
				policy,
				() =>
					new Promise((resolve) => {
						release = resolve;
						started();
					})
			),
			{ owner }
		);
		try {
			const first = task();
			snapshots.push(task.pendingCount);
			await start;
			release('done');
			await first;
			snapshots.push(task.pendingCount);
			const cancelled = task();
			snapshots.push(task.pendingCount);
			task.cancel();
			try {
				await cancelled;
			} catch (error) {
				if (error.name !== 'AbortError') throw error;
			}
			snapshots.push(task.pendingCount);
		} finally {
			await owner[Symbol.asyncDispose]();
		}
	}
	return snapshots;
}
