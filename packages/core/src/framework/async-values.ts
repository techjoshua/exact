export { isPromiseLike } from '../component/async-value.js';

/** Reports whether a value provides the AbortSignal surface used by framework transports. */
export function isAbortSignal(value: unknown): value is AbortSignal {
	return (
		!!value &&
		typeof value === 'object' &&
		'aborted' in value &&
		typeof (value as AbortSignal).addEventListener === 'function'
	);
}
