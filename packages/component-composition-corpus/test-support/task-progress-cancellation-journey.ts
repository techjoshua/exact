type Api = {
	createTaskOwner: typeof import('@exactjs/core').createTaskOwner;
	taskAwait: typeof import('@exactjs/core').taskAwait;
	createTaskProgressReceiver: typeof import('../../core/src/tasks/progress-receiver.js').createTaskProgressReceiver;
};

/** Preserves invocation cancellation identity, fences queued snapshots and releases active cleanup. */
export async function verifyTaskProgressCancellation(api: Api): Promise<void> {
	for (const reason of [null, false, 0, 'cancelled', new Error('cancelled')]) {
		await using owner = api.createTaskOwner();
		const controller = new AbortController();
		let enter!: () => void;
		const entered = new Promise<void>((resolve) => {
			enter = resolve;
		});
		let finish!: () => void;
		const finished = new Promise<void>((resolve) => {
			finish = resolve;
		});
		let activeSignal: AbortSignal | undefined;
		let runs = 0;
		let cleanups = 0;
		const errors: unknown[] = [];
		const receiver = api.createTaskProgressReceiver({
			owner,
			signal: controller.signal,
			label: 'cancellation identity',
			onError: (error) => {
				errors.push(error);
			},
			async receive(_value: number, task) {
				runs++;
				activeSignal = task.signal;
				task.cleanup(() => {
					cleanups++;
				});
				enter();
				try {
					await api.taskAwait(task.signal, finished);
				} finally {
					finish();
				}
			}
		});
		receiver.report(1);
		await entered;
		receiver.report(2);
		controller.abort(reason);
		await finished;
		receiver.report(3);
		await owner[Symbol.asyncDispose]();
		if (activeSignal?.reason !== reason || runs !== 1 || cleanups !== 1 || errors.length)
			throw new Error('Progress cancellation lost identity, cleanup or queued-work fencing');
	}
}

/** Keeps an earlier controller cancellation primary when task startup finds a disposed owner. */
export async function verifyTaskFrameCancellation(api: {
	createTaskOwnerRecord: typeof import('../../core/src/tasks/frame-runtime.js').createTaskOwnerRecord;
	executeTaskFrame: typeof import('../../core/src/tasks/frame-runtime.js').executeTaskFrame;
}): Promise<void> {
	for (const reason of [null, false, 0, 'cancelled', new Error('cancelled')]) {
		const owner = api.createTaskOwnerRecord();
		await owner[Symbol.asyncDispose]();
		const controller = new AbortController();
		controller.abort(reason);
		let calls = 0;
		let caught: unknown;
		try {
			await api.executeTaskFrame({ owner, controller }, () => {
				calls++;
			});
		} catch (error) {
			caught = error;
		}
		if (
			!(caught instanceof Error) ||
			caught.name !== 'AbortError' ||
			!('reason' in caught) ||
			caught.reason !== reason ||
			calls
		)
			throw new Error('Disposed task owner replaced an earlier cancellation or entered work');
	}
}
