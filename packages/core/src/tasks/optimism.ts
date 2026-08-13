import { captureReactiveMutations } from '@exactjs/reactive';

import { isPromiseLike } from '../component/async-value.js';
import type { RuntimeTaskOptions } from './contracts.js';
import type { InternalTaskGeneration } from './runtime-types.js';
import { markTaskPerformanceTrace } from './performance-trace.js';

/** Captures one synchronous optimistic transition for commit or rollback by its task generation. */
export function applyTaskOptimistic<Result>(
	record: InternalTaskGeneration<Result>,
	concurrency: RuntimeTaskOptions<unknown[]>['concurrency'],
	work: () => void
): void {
	if ((concurrency ?? 'parallel') === 'parallel')
		throw new Error('Optimistic state requires a latest or queue task');
	let returned: unknown;
	const journal = captureReactiveMutations(() => {
		returned = work();
	});
	if (isPromiseLike(returned)) {
		journal.rollback();
		throw new TypeError('TaskContext.optimistic() requires a synchronous callback');
	}
	record.journals.push(journal);
	markTaskPerformanceTrace(record, 'optimistic-applied');
}
