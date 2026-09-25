import type { TaskContext, TaskOwner } from './contracts.js';
import { isTaskCancellation } from './cancellation.js';
import { bindTask, defineTask } from './runtime.js';
import { logFrameworkEvent } from '../component/log.js';

/** One replaceable observation lane, owned by an originating invocation. */
export interface TaskProgressReceiver<Snapshot> {
	/** Offers a captured snapshot, replacing any snapshot which has not started. */
	report(snapshot: Snapshot): void;
	/** Fences publication immediately; asynchronous cleanup does not delay the caller. */
	close(reason?: unknown): void;
}

/**
 * Serializes asynchronous progress activations while retaining only the latest pending value.
 * Each activation is an ordinary task with independent staged publication and structural children.
 * It belongs to the durable component owner, but never extends the originating invocation.
 * Callers must capture/validate snapshots before offering them and route errors to diagnostics.
 */
export function createTaskProgressReceiver<Snapshot>(options: {
	readonly owner: TaskOwner;
	readonly signal: AbortSignal;
	readonly label: string;
	readonly priority?: 'immediate' | 'normal' | 'deferred';
	readonly readiness?: 'blocking' | 'nonblocking';
	readonly receive: (snapshot: Snapshot, task: TaskContext) => void | Promise<void>;
	readonly onError: (error: unknown) => void;
}): TaskProgressReceiver<Snapshot> {
	const task = bindTask(
		defineTask<[Snapshot], void>(
			{
				label: options.label,
				placement: 'client',
				readiness: options.readiness ?? 'nonblocking',
				priority: options.priority,
				detached: true,
				owner: options.owner
			},
			options.receive
		),
		{ owner: options.owner }
	);
	let closed = false;
	let running = false;
	let pending: { snapshot: Snapshot } | undefined;
	const close = (reason: unknown = 'progress-complete') => {
		if (closed) return;
		closed = true;
		pending = undefined;
		options.signal.removeEventListener('abort', abort);
		options.owner.signal.removeEventListener('abort', abort);
		task.cancel(reason);
	};
	const abort = () => close(options.signal.reason ?? options.owner.signal.reason);
	const drain = () => {
		if (closed || running || !pending) return;
		const { snapshot } = pending;
		pending = undefined;
		running = true;
		// Observe the invocation's rejection before work can settle. Cancellation is lifecycle,
		// while failures still remain inspectable on the task and reach the supplied diagnostic.
		void Promise.resolve(task(snapshot)).then(
			() => finish(),
			(error: unknown) => {
				try {
					if (!isTaskCancellation(error)) options.onError(error);
				} catch (diagnosticError) {
					logFrameworkEvent(
						'error',
						'core',
						'task',
						'progress error diagnostic failed',
						diagnosticError
					);
				} finally {
					finish();
				}
			}
		);
	};
	const finish = () => {
		running = false;
		drain();
	};
	options.signal.addEventListener('abort', abort, { once: true });
	options.owner.signal.addEventListener('abort', abort, { once: true });
	if (options.signal.aborted || options.owner.signal.aborted) abort();
	return {
		report(snapshot) {
			if (closed) return;
			pending = { snapshot };
			drain();
		},
		close
	};
}
