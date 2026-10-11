import { taskResourceSignal, trackTaskResourceCleanup } from './resource-lifetime.js';

/**
 * Retains task settlement until its native lexical disposers finish. The compiler
 * closes this scope from an outer finally block after native using cleanup. This
 * retains cancellation cleanup without adopting or replacing the native resource.
 */
export function taskNativeCleanupScope(signal: AbortSignal): () => void {
	taskResourceSignal(signal);
	let close!: () => void;
	const completion = new Promise<void>((resolve) => {
		close = resolve;
	});
	trackTaskResourceCleanup(signal, completion);
	return close;
}
