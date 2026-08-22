import { peek } from '@exactjs/reactive/framework/runtime';
import type { TaskContext } from './contracts.js';
import type { InternalTaskFrameOptions, TaskFrameRecord } from './frame-contracts.js';

const contextFrames = new WeakMap<TaskContext, TaskFrameRecord>();

/** Creates and retains the public context owned by one task frame. */
export function createTaskFrameContext(
	frame: TaskFrameRecord,
	options: InternalTaskFrameOptions
): TaskContext {
	const context: TaskContext = {
		signal: frame.controller.signal,
		generation: options.generation ?? 1,
		activation: options.activation ?? 'invoked',
		peek,
		optimistic:
			options.optimistic ??
			(() => {
				throw new Error('Optimistic state is not available for this task activation');
			}),
		cleanup(cleanup) {
			if (frame.settled || !frame.producerOpen)
				throw new Error('Cannot register cleanup after the task producer has closed');
			(frame.cleanups ??= []).push(cleanup);
		},
		own(resource) {
			context.cleanup(async () => {
				if (Symbol.asyncDispose in resource) await resource[Symbol.asyncDispose]();
				else resource[Symbol.dispose]();
			});
			return resource;
		}
	};
	contextFrames.set(context, frame);
	return context;
}

/** Resolves the opaque frame retained by a task context. */
export function frameForTaskContext(context: TaskContext): TaskFrameRecord {
	const frame = contextFrames.get(context);
	if (!frame || frame.settled)
		throw new Error('Task context belongs to a settled or unknown frame');
	return frame;
}
