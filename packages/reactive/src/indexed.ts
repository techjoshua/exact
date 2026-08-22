import { createIndexedReactive } from './indexed-base.js';
import type { Reactive, ReactiveOptions } from './internal/types.js';
import { reactive } from './reactive.js';

/** Creates indexed state whose nested values retain the complete reactive container contract. */
export function indexedReactive<T extends object>(
	keys: readonly PropertyKey[],
	options: ReactiveOptions = {}
): Reactive<T> {
	return createIndexedReactive<T>(keys, options, reactive);
}

export { readReactiveOwnProperty } from './indexed-base.js';
