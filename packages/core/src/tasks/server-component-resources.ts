import { raceTaskCancellation } from './cancellation.js';

/** Awaits compiler-closed server work with request cancellation and no durable task frame. */
export function awaitServerComponentTask<T>(
	signal: AbortSignal,
	value: T | PromiseLike<T>
): Promise<T> {
	return raceTaskCancellation(signal, value);
}

/** Owns a timeout directly by the request-local server execution signal. */
export function serverComponentTaskTimeout<Args extends unknown[]>(
	signal: AbortSignal,
	handler: (...args: Args) => void,
	delay?: number,
	...args: Args
): ReturnType<typeof setTimeout> {
	const abort = () => clearTimeout(timeout);
	const timeout = setTimeout(
		(...values: Args) => {
			signal.removeEventListener('abort', abort);
			if (!signal.aborted) handler(...values);
		},
		delay,
		...args
	);
	if (signal.aborted) abort();
	else signal.addEventListener('abort', abort, { once: true });
	return timeout;
}
