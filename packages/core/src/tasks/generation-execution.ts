import type { RuntimeTaskOptions, TaskContext } from './contracts.js';
import { executeTaskFrame } from './frame-runtime.js';
import type { TaskOwnerRecord } from './frame-contracts.js';
import { applyTaskOptimistic } from './optimism.js';
import type { InternalTaskGeneration } from './runtime-types.js';

/** Executes one scheduled generation inside its structural frame and optional renderer permit. */
export function executeScheduledTaskGeneration<Args extends unknown[], Result>(
	owner: TaskOwnerRecord,
	record: InternalTaskGeneration<Result>,
	options: RuntimeTaskOptions<Args>,
	sourceEntityId: string | undefined,
	implementation: (...args: [...Args, TaskContext]) => Result | Promise<Result>
): Promise<Result> {
	const execute = () =>
		executeTaskFrame(
			{
				parent: record.parent,
				parentReserved: record.releaseReservation !== undefined,
				owner,
				controller: record.controller,
				generation: record.generation,
				activation: record.activation,
				label: options.label,
				sourceEntityId,
				placement: options.placement,
				concurrency: options.concurrency,
				detached: options.detached,
				priority: record.priority,
				readiness: record.readiness,
				optimistic: (work) => applyTaskOptimistic(record, options.concurrency, work),
				propagateFailure: () => !record.observed
			},
			(context) =>
				implementation(...([...record.args, context] as unknown as [...Args, TaskContext]))
		);
	return owner.runTask && !record.parent ? owner.runTask(execute) : execute();
}
