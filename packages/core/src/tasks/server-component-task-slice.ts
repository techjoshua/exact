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
	const context: TaskContext = {
		signal: signal,
		generation: 1,
		activation: 'initialization',
		peek: (read) => read(),
		optimistic: (update) => update(),
		cleanup(cleanup) {
			cleanups.push(cleanup);
		},
		own<T extends Disposable | AsyncDisposable>(resource: T): T {
			cleanups.push(() => {
				if (Symbol.asyncDispose in resource)
					return Promise.resolve(resource[Symbol.asyncDispose]());
				resource[Symbol.dispose]();
			});
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
	}
	if (failed) throw failure;
	return result;
}
