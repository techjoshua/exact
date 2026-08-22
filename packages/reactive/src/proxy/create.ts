import type { ReactiveOptions, ReactiveRef } from '../internal/types.js';
import { reactiveCollectionMember } from './collections.js';
import { createReactiveBase } from './create-base.js';

/** Creates a general reactive proxy, including observable Map and Set members. */
export function createReactive(
	value: object,
	options: ReactiveOptions,
	parentSource?: ReactiveRef
): object {
	return createReactiveBase(value, options, parentSource, reactiveCollectionMember);
}
