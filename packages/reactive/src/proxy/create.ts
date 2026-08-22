import type { ReactiveOptions, ReactiveRef } from '../internal/types.js';
import { reactiveCollectionMember } from './collections.js';
import { createReactiveBase } from './create-base.js';
import { defaultReactiveOptions, readonlyReactiveOptionsKey } from './state.js';

type CollectionReactiveOptions = ReactiveOptions & { __exactCollectionCacheMode: true };
const collectionOptions = new WeakMap<object, CollectionReactiveOptions>();

/** Creates a general reactive proxy, including observable Map and Set members. */
export function createReactive(
	value: object,
	options: ReactiveOptions,
	parentSource?: ReactiveRef
): object {
	const key = collectionOptionsKey(options);
	let selected = collectionOptions.get(key);
	if (!selected) {
		const created = Object.assign(Object.create(key) as ReactiveOptions, {
			__exactCollectionCacheMode: true as const
		});
		collectionOptions.set(key, created);
		selected = created;
	}
	return createReactiveBase(value, selected, parentSource, reactiveCollectionMember);
}

function collectionOptionsKey(options: ReactiveOptions): object {
	if (
		!options.readonly &&
		!options.onReadonlyWrite &&
		!options.onMutation &&
		!options.passthroughKeys?.length
	)
		return defaultReactiveOptions;
	if (
		options.readonly &&
		!options.onReadonlyWrite &&
		!options.onMutation &&
		!options.passthroughKeys?.length
	)
		return readonlyReactiveOptionsKey;
	return options as object;
}
