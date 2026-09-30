import { taskAwait } from '@exactjs/core/runtime/tasks';
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

/** A task may synchronously cancel a sibling without retaining its own frame in later work. */
export async function taskCancellationJourney() {
	const owner = createTaskOwner();
	let started;
	const ready = new Promise((resolve) => {
		started = resolve;
	});
	const held = bindTask(
		defineTask({}, async (context) => {
			started();
			await taskAwait(context.signal, new Promise(() => {}));
		}),
		{ owner }
	);
	const cancel = bindTask(
		defineTask({}, () => held.cancel('superseded')),
		{ owner }
	);
	try {
		const pending = Promise.resolve(held()).catch((error) => {
			if (error.name !== 'AbortError') throw error;
		});
		await ready;
		await cancel();
		await pending;
		await new Promise((resolve) => setTimeout(resolve, 0));
		const next = bindTask(
			defineTask({}, () => 42),
			{ owner }
		);
		return await next();
	} finally {
		await owner[Symbol.asyncDispose]();
	}
}
