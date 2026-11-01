import type { withAbortSignal, withTaskSignal } from '../../core/src/tasks/signals.js';
import type {
	withExistingAbortSignal,
	withExistingTaskSignal
} from '../../core/src/tasks/cleanup-signals.js';
/** Checks native listeners, request options, inherited getters, and authored versus owned cancellation. */
export function verifyTaskNativeOptions(api: {
	withAbortSignal: typeof withAbortSignal;
	withTaskSignal: typeof withTaskSignal;
	withExistingAbortSignal: typeof withExistingAbortSignal;
	withExistingTaskSignal: typeof withExistingTaskSignal;
}): true;
