import type { RuntimeTaskOptions, TaskContext } from './contracts.js';
import type { AnyComponentInstance } from '../component/contracts.js';
import { componentLogMethod } from '../component/log.js';
import { frameForTaskContext } from './frame-runtime.js';
import type { TaskFrameRecord } from './frame-contracts.js';
import { taskOwnerForHost } from './owner-hosts.js';
import { createTaskProgressReceiver, type TaskProgressReceiver } from './progress-receiver.js';

/** Compiler-owned receiver work. Only validated snapshot arguments reach this boundary. */
export type TaskProgressWork = (snapshot: unknown, task: TaskContext) => void | Promise<void>;

type ProgressReceiverOptions = Pick<
	RuntimeTaskOptions<[unknown]>,
	'label' | 'priority' | 'readiness'
>;
const receivers = new WeakMap<
	object,
	Map<string, { work: TaskProgressWork; options: ProgressReceiverOptions }>
>();
const reporters = new WeakMap<TaskFrameRecord, (id: string, snapshot: unknown) => void>();

/** Registers one compiled receiver against its durable component, without activating it. */
export function registerTaskProgressReceiver<Snapshot>(
	host: object,
	id: string,
	work: (snapshot: Snapshot, task: TaskContext) => void | Promise<void>,
	options: ProgressReceiverOptions
): (snapshot: Snapshot) => void {
	let registry = receivers.get(host);
	if (!registry) receivers.set(host, (registry = new Map()));
	if (registry.has(id)) throw new Error(`Duplicate task progress receiver ${id}`);
	registry.set(id, { work: work as TaskProgressWork, options });
	return () => {
		throw new Error('Progress receivers are invoked by server continuation progress');
	};
}

/** Binds a server frame to its trusted, invocation-local progress transport. */
export function attachTaskProgressReporter(
	task: TaskContext,
	report: (id: string, snapshot: unknown) => void
): void {
	reporters.set(frameForTaskContext(task), report);
}

/**
 * Captures explicit server progress authority while an executor establishes its lexical tasks.
 * SSR has no transport and therefore creates a no-op. Retained callbacks stop at cancellation
 * or settlement even if application code invokes them after the originating frame has closed.
 */
export function createTaskProgressReporter(
	id: string,
	task?: TaskContext
): (snapshot: unknown) => void {
	const ownedFrame = task && frameForTaskContext(task);
	const report = ownedFrame && reporters.get(ownedFrame);
	return (snapshot) => {
		if (ownedFrame && !ownedFrame.settled && !ownedFrame.controller.signal.aborted)
			report?.(id, snapshot);
	};
}

/** Creates an isolated receiver lane for a validated operation and live component instance. */
export function taskProgressReceiverForHost(
	host: AnyComponentInstance,
	id: string,
	signal: AbortSignal
): TaskProgressReceiver<unknown> {
	const owner = taskOwnerForHost(host);
	const receiver = receivers.get(host)?.get(id);
	if (!owner || !receiver) throw new Error(`Unknown component task progress receiver ${id}`);
	return createTaskProgressReceiver({
		owner,
		signal,
		...receiver.options,
		label: receiver.options.label ?? id,
		receive: receiver.work,
		onError: (error) =>
			componentLogMethod(
				host,
				'error'
			)?.(() => ['Task progress receiver failed', error, { receiver: id }])
	});
}
