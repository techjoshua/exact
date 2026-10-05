import { disposeSymbolicTaskResource } from './resource-disposal.js';
import { registerTaskResourceOwner, settleTaskResourceLifetime } from './resource-lifetime.js';
import type { TaskContext } from './contracts.js';
import type { ServerExecutionOptions } from './server-component-execution-contracts.js';

/** Executes one flat SSR slice under its request permit and releases its owned resources in LIFO order. */
export async function executeServerComponentTaskSlice<Args extends unknown[], Result>(
	signal: AbortSignal,
	runTask: ServerExecutionOptions['runTask'],
	work: (...args: [...Args, TaskContext]) => Result | PromiseLike<Result>,
	inputs: Args
): Promise<Result> {
	if (signal.aborted) throw signal.reason;
	const cleanups: (() => void | Promise<void>)[] = [];
	// The request signal is shared by sibling slices. Materialize a distinct
	// generation signal only when authored work asks for cancellation ownership.
	let generation: AbortController | undefined;
	const cancel = () => generation?.abort(signal.reason);
	const context: TaskContext = {
		get signal() {
			if (!generation) {
				generation = new AbortController();
				registerTaskResourceOwner(generation.signal);
				if (signal.aborted) cancel();
				else signal.addEventListener('abort', cancel, { once: true });
			}
			return generation.signal;
		},
		generation: 1,
		activation: 'initialization',
		peek: (read) => read(),
		optimistic: (update) => update(),
		cleanup(cleanup) {
			cleanups.push(cleanup);
		},
		own<T extends Disposable | AsyncDisposable>(resource: T): T {
			cleanups.push(() => disposeSymbolicTaskResource(resource));
			return resource;
		}
	};
	let result!: Result;
	let failure: unknown;
	let failed = false;
	try {
		const invoke = async () => Promise.resolve(work(...inputs, context));
		result = runTask ? await runTask(invoke) : await invoke();
	} catch (error) {
		failure = error;
		failed = true;
	} finally {
		for (let index = cleanups.length - 1; index >= 0; index--) {
			try {
				await cleanups[index]!();
			} catch (cleanupError) {
				if (failure && typeof failure === 'object')
					Object.defineProperty(failure, 'suppressed', {
						configurable: true,
						value: cleanupError
					});
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
	if (failed) throw failure;
	return result;
}
