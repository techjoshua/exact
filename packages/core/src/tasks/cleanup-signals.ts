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
	const normalized = { ...options };
	if (!('signal' in normalized) || !isAbortSignal(normalized.signal)) return normalized;
	return { ...normalized, signal: combineTaskSignal(owner, normalized.signal) } as T;
}

/** Preserves native capture flags and cleanup event options, adapting only an authored signal. */
export function withExistingAbortSignal(
	options: boolean | ManagedEventListenerOptions | undefined,
	owner: AbortSignal
): boolean | ManagedEventListenerOptions | undefined {
	return typeof options === 'boolean' ? options : withExistingTaskSignal(options, owner);
}
