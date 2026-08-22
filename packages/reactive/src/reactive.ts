import { isReactiveContainer } from './change-detection.js';
import type { Reactive, ReactiveOptions } from './internal/types.js';
import { unwrap } from './internal/values.js';
import { createReactive } from './proxy/create.js';
import { defaultReactiveOptions } from './proxy/state.js';

/** Creates a reactive proxy that tracks reads and notifies watchers when writable state changes. */
export function reactive<T extends object>(
	value: T,
	options: ReactiveOptions = defaultReactiveOptions
): Reactive<T> {
	if (!isReactiveContainer(unwrap(value))) return value as Reactive<T>;
	return createReactive(value, options) as Reactive<T>;
}
