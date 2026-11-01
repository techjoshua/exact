import { deriveRuntimeConfiguration } from '../framework/configuration.js';
import { combineTaskSignal, isAbortSignal } from './signals.js';
import type { ManagedEventListenerOptions } from './signals.js';

/** Adapts an explicitly supplied cleanup signal without injecting cancellation into absent inputs. */
export function combineExistingTaskSignal(
	owner: AbortSignal,
	existing?: AbortSignal
): AbortSignal | undefined {
	return existing ? combineTaskSignal(owner, existing) : undefined;
}

/** Preserves cleanup options and adapts their existing signal without adding one to new native work. */
export function withExistingTaskSignal<T extends object | undefined>(
	options: T,
	owner: AbortSignal
): T {
	if (!options) return options;
	return deriveRuntimeConfiguration<object>(options, (captured) => {
		const existing: unknown = Reflect.get(captured, 'signal');
		return isAbortSignal(existing) ? { signal: combineTaskSignal(owner, existing) } : {};
	}) as T;
}

/** Preserves native capture flags and cleanup event options, adapting only an authored signal. */
export function withExistingAbortSignal(
	options: boolean | ManagedEventListenerOptions | undefined,
	owner: AbortSignal
): boolean | ManagedEventListenerOptions | undefined {
	if (typeof options === 'boolean' || !options) return options;
	return {
		capture: options.capture,
		once: options.once,
		passive: options.passive,
		signal: combineExistingTaskSignal(owner, options.signal)
	};
}
