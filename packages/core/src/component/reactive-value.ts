import { reactive, ref as reactiveRef, type Reactive } from '@exact/reactive';

/** Preserves reactive objects while wrapping primitive context values in refs. */
export function reactiveValue<T>(value: T): Reactive<T> {
	if (reactiveRef(value)) return value as Reactive<T>;
	if (value && typeof value === 'object') return reactive(value as object) as Reactive<T>;
	return value as Reactive<T>;
}
