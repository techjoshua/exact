import type { PendingReactiveTransaction } from '@exactjs/reactive/framework/transactions';

interface TaskTransactions {
	transactions: Set<PendingReactiveTransaction>;
	abort(): void;
}

const pending = new WeakMap<AbortSignal, TaskTransactions>();

/** Retains journals until their task publishes or discards, with one cancellation listener per signal. */
export function retainPendingTaskTransaction(
	signal: AbortSignal,
	transaction: PendingReactiveTransaction
): void {
	let owned = pending.get(signal);
	if (!owned) {
		owned = { transactions: new Set(), abort: () => discardPendingTaskTransactions(signal) };
		pending.set(signal, owned);
		signal.addEventListener('abort', owned.abort, { once: true });
	}
	owned.transactions.add(transaction);
}

/** Closes published journals and releases their task bookkeeping and cancellation listener. */
export function releasePendingTaskTransactions(signal: AbortSignal): void {
	const owned = pending.get(signal);
	if (!owned) return;
	for (const transaction of owned.transactions) transaction.finishPublication();
	signal.removeEventListener('abort', owned.abort);
	pending.delete(signal);
}

/** Discards unpublished cells as well as publication callbacks, including manual task rejection. */
export function discardPendingTaskTransactions(signal: AbortSignal): void {
	const owned = pending.get(signal);
	if (!owned) return;
	for (const transaction of owned.transactions) transaction.discard();
	releasePendingTaskTransactions(signal);
}
