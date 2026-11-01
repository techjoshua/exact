import type * as Reactive from '../../reactive/src/index.js';
/** Checks atomic publication and retained journal ownership for small or wide nested writes. */
export function verifyWideTransactions(
	api: Pick<
		typeof Reactive,
		'reactive' | 'batch' | 'publishBatch' | 'captureReactiveMutations' | 'watch' | 'flushSync'
	>,
	count?: number
): void;
