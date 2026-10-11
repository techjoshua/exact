/** Framework-owned explicit pending transactions, separate from synchronous batches and optimistic journals. */
export { createPendingReactiveTransaction } from '../pending/pending-state.js';
export type {
	PendingReactiveState,
	PendingReactiveTransaction
} from '../pending/pending-state-contract.js';
export type { PendingTransactionOptions } from '../pending/pending-journal.js';
