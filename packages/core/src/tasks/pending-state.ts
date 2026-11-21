import { taskRequestReadReceivers } from './property-mutations.js';
import {
	createPendingReactiveTransaction,
	type PendingReactiveState
} from '@exactjs/reactive/framework/transactions';
import { pendingTaskCollectionObserver, stageTaskMutation } from './task-publication.js';
import { taskAwait } from './resources.js';
import { TaskCancellation } from './cancellation.js';
import { retainPendingTaskTransaction } from './pending-transactions.js';

export type { PendingReactiveState as CompiledTaskState } from '@exactjs/reactive/framework/transactions';

/** Adapts an explicit reactive transaction to task generation fencing and ordered publication. */
export function createTaskState(signal: AbortSignal, root: object): PendingReactiveState {
	const receivers = taskRequestReadReceivers(signal, root);
	const transaction = createPendingReactiveTransaction(root, {
		cancelledReadReceivers: receivers ? () => (signal.aborted ? receivers : undefined) : undefined,
		assertCurrent: () => {
			if (signal.aborted) throw new TaskCancellation(signal.reason);
		},
		beforeCollectionWrite: pendingTaskCollectionObserver(signal),
		stage: (mutation) => stageTaskMutation(signal, mutation),
		await: (value) => taskAwait(signal, value),
		owns: (value, state) => Reflect.getOwnPropertyDescriptor(value, 'state')?.value === state
	});
	retainPendingTaskTransaction(signal, transaction);
	return transaction;
}
