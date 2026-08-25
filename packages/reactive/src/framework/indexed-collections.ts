import { createIndexedReactive } from '../indexed-base.js';
import type { Reactive, ReactiveOptions } from '../internal/types.js';
import { reactive } from '../reactive.js';

/** Creates compiler-indexed readonly props while retaining live values and collection wrapping. */
export function indexedReactiveCollectionProps<T extends object>(
	keys: readonly PropertyKey[],
	initial: T,
	options: ReactiveOptions
): Reactive<T> {
	return createIndexedReactive<T>(keys, options, reactive, initial, true);
}
