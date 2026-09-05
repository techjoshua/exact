import { createIndexedReactive } from '../indexed-base.js';
export {
	readReactiveOwnProperty,
	readReactiveOwnPropertyInto,
	type ReactiveOwnPropertyReadCell
} from '../indexed-base.js';
import type { Reactive, ReactiveOptions } from '../internal/types.js';
import { reactiveObjects } from './objects.js';

/** Creates compiler-proven indexed state with object/array-only nested observation. */
export function indexedReactiveObjects<T extends object>(
	keys: readonly PropertyKey[],
	options: ReactiveOptions = {},
	initial?: T,
	preserveReactiveValues = false
): Reactive<T> {
	return createIndexedReactive<T>(keys, options, reactiveObjects, initial, preserveReactiveValues);
}
