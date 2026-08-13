import { computed, type ReactiveValue } from '@exactjs/reactive';

/** Creates one shared, lazily evaluated derived component value for compiler output. */
export function createDerived<T>(compute: () => T): ReactiveValue<T> {
	return computed(compute);
}
