import type { ContinuationDependencySource } from './dependency-source.js';

const sources = new WeakMap<object, ContinuationDependencySource>();

/** Associates one compiler-created reactive value with its unresolved execution source. */
export function markContinuationDependencyValue<T>(
	value: T,
	source: ContinuationDependencySource
): T {
	if ((typeof value === 'object' && value !== null) || typeof value === 'function')
		sources.set(value, source);
	return value;
}

/** Returns the unresolved execution source propagated with a compiler-created value. */
export function continuationDependencyForValue(
	value: unknown
): ContinuationDependencySource | undefined {
	if (!((typeof value === 'object' && value !== null) || typeof value === 'function'))
		return undefined;
	return sources.get(value);
}
