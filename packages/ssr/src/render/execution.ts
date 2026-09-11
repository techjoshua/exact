import { attachSuppressedCleanupFailure } from '@exactjs/core';

/** Internal operations return available output directly and allocate promises only for pending work. */
export type RenderValue<T> = T | Promise<T>;

/** Continues immediately for available work, preserving native promise settlement when pending. */
export function mapRenderValue<T, Result>(
	value: RenderValue<T>,
	read: (value: T) => RenderValue<Result>
): RenderValue<Result> {
	return value instanceof Promise ? value.then(read) : read(value);
}

/**
 * Keeps cleanup attached to one render operation through synchronous and asynchronous completion.
 * A cleanup failure is suppressed behind an existing primary failure, never substituted for it.
 */
export function withRenderCleanup<T>(
	render: () => RenderValue<T>,
	cleanup: () => void | Promise<void>
): RenderValue<T> {
	let result: RenderValue<T>;
	try {
		result = render();
	} catch (error) {
		return cleanupAfterFailure(error, cleanup);
	}
	if (result instanceof Promise)
		return result.then(
			(value) => finishRender(value, cleanup),
			(error) => cleanupAfterFailure(error, cleanup)
		);
	return finishRender(result, cleanup);
}

function finishRender<T>(value: T, cleanup: () => void | Promise<void>): RenderValue<T> {
	const disposal = cleanup();
	return disposal instanceof Promise ? disposal.then(() => value) : value;
}

/** Runs failure cleanup once and keeps the original failure authoritative. */
function cleanupAfterFailure(
	error: unknown,
	cleanup: () => void | Promise<void>
): RenderValue<never> {
	let disposal: void | Promise<void>;
	try {
		disposal = cleanup();
	} catch (suppressed) {
		attachSuppressedCleanupFailure(error, suppressed);
		throw error;
	}
	if (disposal instanceof Promise)
		return disposal.then(
			() => {
				throw error;
			},
			(suppressed) => {
				attachSuppressedCleanupFailure(error, suppressed);
				throw error;
			}
		);
	throw error;
}
