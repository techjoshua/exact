import type { TaskContext } from '../../core/src/tasks/contracts.js';
import type { runTaskFrame } from '../../core/src/framework/task-frames.js';

/** Checks task failure preservation and cleanup through an injected execution owner. */
export function verifyTaskFailureOwnership(
	execute: <Result>(work: (task: TaskContext) => Result) => Promise<Result>
): Promise<void>;

/** Checks cancellation isolation for structurally settled children. */
export function verifySettledChildCancellation(run: typeof runTaskFrame): Promise<void>;
