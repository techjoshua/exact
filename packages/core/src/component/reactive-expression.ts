import { computed, unwrap, type ReactiveValue } from '@exactjs/reactive/framework/runtime';
import { isTemplateStringsArray } from './construction.js';

/** Creates the reactive value exposed by the component `reactive` convenience method. */
export function createComponentReactive<T>(
	input: TemplateStringsArray | (() => T) | T,
	values: readonly unknown[]
): ReactiveValue<string> | ReactiveValue<T> {
	if (typeof input === 'function') return computed(input as () => T);
	if (!isTemplateStringsArray(input)) return computed(() => input);
	return computed(() => {
		let result = '';
		for (let index = 0; index < input.length; index++) {
			result += input[index];
			if (index < values.length) result += String(unwrap(values[index]) ?? '');
		}
		return result;
	});
}
