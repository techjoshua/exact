import type { TaskCancellation, isTaskCancellation } from '../../core/src/tasks/cancellation.js';
import type { runTaskFrame } from '../../core/src/framework/task-frames.js';

/** Framework capabilities exercised by the shared cancellation journey. */
type CancellationApi = {
	TaskCancellation: typeof TaskCancellation;
	isTaskCancellation: typeof isTaskCancellation;
	runTaskFrame: typeof runTaskFrame;
};

/** Verifies cancellation reasons, ownership and compatible provider classification. */
export function verifyTaskCancellationContract(
	api: CancellationApi,
	foreign?: Pick<CancellationApi, 'TaskCancellation' | 'isTaskCancellation'>
): Promise<void>;
