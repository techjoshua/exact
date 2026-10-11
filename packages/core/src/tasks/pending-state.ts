import {
	createPendingReactiveTransaction,
	type PendingReactiveState
} from '@exactjs/reactive/framework/transactions';
import { stageTaskMutation } from './task-publication.js';
import { taskAwait } from './resources.js';
import { TaskCancellation } from './cancellation.js';
import { retainPendingTaskTransaction } from './pending-transactions.js';

export type { PendingReactiveState as CompiledTaskState } from '@exactjs/reactive/framework/transactions';

/** Adapts an explicit reactive transaction to task generation fencing and ordered publication. */
export function createTaskState(signal: AbortSignal, root: object): PendingReactiveState {
	const transaction = createPendingReactiveTransaction(root, {
		assertCurrent: () => {
			if (signal.aborted) throw new TaskCancellation(signal.reason);
		},
		stage: (mutation) => stageTaskMutation(signal, mutation),
		await: (value) => taskAwait(signal, value),
		owns: (value, state) => Reflect.getOwnPropertyDescriptor(value, 'state')?.value === state
	});
	retainPendingTaskTransaction(signal, transaction);
	return transaction;
}
