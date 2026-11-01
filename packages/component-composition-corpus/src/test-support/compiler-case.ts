import type { TestContext } from 'vitest';

/**
 * Own a correctness case that compiles a finite set of fixtures or imports a compiled registry.
 * Cold compilation has a 30 second elapsed warning instead of an aggregate case deadline.
 * Each native request retains its existing timeout. Awaited work is fenced on both sides so
 * cancellation cannot resume assertions or start another fixture after test cleanup.
 * Vitest releases the warning timer when the owning case finishes, including cancellation.
 */
export function ownCorpusCompilation(context: TestContext) {
	context.signal.throwIfAborted();
	const warning = setTimeout(() => {
		console.warn(`Corpus compilation case is still running after 30 seconds: ${context.task.name}`);
	}, 30_000);
	context.onTestFinished(() => clearTimeout(warning));
	return async <T>(work: () => T | PromiseLike<T>): Promise<T> => {
		context.signal.throwIfAborted();
		const result = await work();
		context.signal.throwIfAborted();
		return result;
	};
}
