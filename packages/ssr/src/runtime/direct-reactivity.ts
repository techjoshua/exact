import type { ReactiveValue } from '@exactjs/reactive/framework/runtime';

const reactiveValueMarker = Symbol.for('exact.reactive.value');
const reactiveValueRef = Symbol.for('exact.reactive.valueRef');

/**
 * Creates a request-local derived value for compiler-scheduled SSR.
 *
 * Reads intentionally recompute: direct-frame state is plain storage mutated by the generated
 * task plan, so caching without a dependency graph would retain a stale pre-task value.
 */
export function directSsrReactive<T>(compute: () => T): ReactiveValue<T> {
	const get = (): T => compute();
	const source = {
		target: {},
		key: 'value',
		get,
		set(): never {
			throw new TypeError('Cannot write to readonly reactive value');
		}
	};
	return {
		[reactiveValueMarker]: true,
		[reactiveValueRef]: source,
		get,
		toJSON: get,
		toString: () => String(get()),
		valueOf: get,
		[Symbol.toPrimitive]: get
	} as ReactiveValue<T>;
}
