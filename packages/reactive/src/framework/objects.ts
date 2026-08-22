import { isReactiveContainer } from '../change-detection.js';
import type { Reactive, ReactiveOptions } from '../internal/types.js';
import { unwrap } from '../internal/values.js';
import { createReactiveBase } from '../proxy/create-base.js';
import { defaultReactiveOptions } from '../proxy/state.js';

/** Creates a compiler-proven object/array reactive without retaining collection interception. */
export function reactiveObjects<T extends object>(
	value: T,
	options: ReactiveOptions = defaultReactiveOptions
): Reactive<T> {
	const raw = unwrap(value);
	if (!isReactiveContainer(raw)) return value as Reactive<T>;
	if (raw instanceof Map || raw instanceof Set)
		throw new TypeError('Compiled object/array state received a Map or Set value');
	return createReactiveBase(raw, options) as Reactive<T>;
}
