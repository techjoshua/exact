import { publishTaskMutations } from './task-publication.js';
import { disposeSymbolicTaskResource } from './resource-disposal.js';
import { attachSuppressedCleanupFailure } from '../cleanup.js';
import { registerTaskResourceOwner, settleTaskResourceLifetime } from './resource-lifetime.js';
import type { TaskContext } from './contracts.js';
import type { ServerExecutionOptions } from './server-component-execution-contracts.js';

/** Executes one flat SSR slice under its request permit and releases its owned resources in LIFO order. */
export async function executeServerComponentTaskSlice<Args extends unknown[], Result>(
	signal: AbortSignal,
	runTask: ServerExecutionOptions['runTask'],
	work: (...args: [...Args, TaskContext]) => Result | PromiseLike<Result>,
	inputs: Args,
	publish?: () => void
): Promise<Result> {
	if (signal.aborted) throw signal.reason;
	const cleanups: (() => void | Promise<void>)[] = [];
	let producerOpen = true;
	// The request signal is shared by sibling slices. Materialize a distinct
	// generation signal only when authored work asks for cancellation ownership.
	let generation: AbortController | undefined;
	const cancel = () => generation?.abort(signal.reason);
	const context: TaskContext = {
		get signal() {
			if (!generation) {
				generation = new AbortController();
				registerTaskResourceOwner(generation.signal);
				if (failed) generation.abort(failure);
				else if (producerOpen && signal.aborted) cancel();
				else if (producerOpen) signal.addEventListener('abort', cancel, { once: true });
				if (!producerOpen) void settleTaskResourceLifetime(generation.signal);
			}
			return generation.signal;
		},
		generation: 1,
		activation: 'initialization',
		peek: (read) => read(),
		optimistic: (update) => update(),
		cleanup(cleanup) {
			if (!producerOpen)
				throw new Error('Cannot register cleanup after the task producer has closed');
			cleanups.push(cleanup);
		},
		own<T extends Disposable | AsyncDisposable>(resource: T): T {
			context.cleanup(() => disposeSymbolicTaskResource(resource));
			return resource;
		}
	};
	let result!: Result;
	let failure: unknown;
	let failed = false;
	try {
		const invoke = async () => {
			if (signal.aborted) throw signal.reason;
			try {
				return await work(...inputs, context);
			} finally {
				producerOpen = false;
			}
		};
		result = runTask ? await runTask(invoke) : await invoke();
	} catch (error) {
		failure = error;
		failed = true;
		generation?.abort(error);
	} finally {
		producerOpen = false;
		for (let index = cleanups.length - 1; index >= 0; index--) {
			try {
				await cleanups[index]!();
			} catch (cleanupError) {
				if (failed) attachSuppressedCleanupFailure(failure, cleanupError);
				else failure = cleanupError;
				failed = true;
			}
		}
		if (generation) {
			signal.removeEventListener('abort', cancel);
			const resources = settleTaskResourceLifetime(generation.signal);
			if (resources) await resources;
		}
	}
	if (failed) {
		generation?.abort(failure);
		throw failure;
	}
	if (signal.aborted) {
		failed = true;
		failure = signal.reason;
		generation?.abort(signal.reason);
		throw signal.reason;
	}
	// Output ports read the host immediately after this slice settles.
	try {
		if (generation) publishTaskMutations(generation.signal);
		publish?.();
	} catch (error) {
		generation?.abort(error);
		throw error;
	}
	return result;
}
