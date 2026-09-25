import type { AnyComponentInstance } from '@exactjs/core';
import {
	taskProgressReceiverForHost,
	type TaskProgressReceiver
} from '@exactjs/core/framework/task-frames';
import type { ExactProgressObserver } from '../response/progress.js';

/** Owns receiver lanes for exactly one invocation of a live component. */
export function createComponentProgressObserver(
	instance: AnyComponentInstance,
	receivers: readonly string[],
	signal: AbortSignal
): ExactProgressObserver {
	const lanes = new Map<string, TaskProgressReceiver<unknown>>();
	let closed = false;
	return {
		receivers,
		report(id, snapshot) {
			if (closed || signal.aborted) return;
			if (!receivers.includes(id)) throw new TypeError('Undeclared task progress receiver');
			let lane = lanes.get(id);
			if (!lane) lanes.set(id, (lane = taskProgressReceiverForHost(instance, id, signal)));
			lane.report(snapshot);
		},
		close() {
			if (closed) return;
			closed = true;
			for (const lane of lanes.values()) lane.close();
			lanes.clear();
		}
	};
}
