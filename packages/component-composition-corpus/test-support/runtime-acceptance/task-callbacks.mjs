import { runTaskFrame } from '@exactjs/core/framework/task-frames';
import { combineTaskSignal, taskTimeout, taskInterval } from '@exactjs/core';

/** Checks callback-created children retain settlement through original and adapted owner signals. */
export async function taskCallbackOwnershipJourney() {
	const results = [];
	for (const kind of ['timeout', 'interval'])
		for (const adapted of [false, true]) {
			let releaseBody, releaseChild, markStarted;
			const body = new Promise((resolve) => (releaseBody = resolve));
			const held = new Promise((resolve) => (releaseChild = resolve));
			const started = new Promise((resolve) => (markStarted = resolve));
			let child,
				finished = false,
				settled = false;
			const parent = runTaskFrame(
				{ kind: 'resource-parent' },
				{
					work(task) {
						const signal = adapted
							? combineTaskSignal(task.signal, new AbortController().signal)
							: task.signal;
						let interval;
						const callback = () => {
							if (interval !== undefined) clearInterval(interval);
							child = runTaskFrame(
								{ kind: 'resource-child' },
								{
									async work() {
										await held;
										finished = true;
									}
								}
							);
							releaseBody();
							markStarted();
						};
						if (kind === 'timeout') taskTimeout(signal, callback, 0);
						else interval = taskInterval(signal, callback, 1);
						return body;
					}
				}
			).then(() => (settled = true));
			let premature;
			try {
				await started;
				await new Promise((resolve) => setTimeout(resolve, 0));
				premature = settled;
			} finally {
				releaseBody();
				releaseChild();
				await Promise.all([parent, child]);
			}
			results.push({ premature, finished });
		}
	return results;
}
