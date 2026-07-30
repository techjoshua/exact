import type { RuntimeTaskOptions } from './contracts.js';

/** Validates policy values supplied by compilerless task definitions. */
export function validateTaskOptions<Args extends unknown[]>(
	options: RuntimeTaskOptions<Args>
): void {
	if (options.captureArguments !== undefined && typeof options.captureArguments !== 'function')
		throw new TypeError('Task argument capture must be a function');
	if (
		options.concurrency !== undefined &&
		options.concurrency !== 'parallel' &&
		options.concurrency !== 'latest' &&
		options.concurrency !== 'queue'
	)
		throw new TypeError(`Unsupported task concurrency "${String(options.concurrency)}"`);
	if (
		options.priority !== undefined &&
		options.priority !== 'immediate' &&
		options.priority !== 'normal' &&
		options.priority !== 'deferred'
	)
		throw new TypeError(`Unsupported task priority "${String(options.priority)}"`);
}
