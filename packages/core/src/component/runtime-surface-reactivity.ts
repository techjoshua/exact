import type { ReactiveValue } from '@exactjs/reactive/framework/runtime';
import { createComponentReactive } from './reactive-expression.js';
import { registerComponentRuntimeSurface } from './runtime-surface-registration.js';

function reactive<T>(
	input: TemplateStringsArray | (() => T) | T,
	...values: unknown[]
): ReactiveValue<string> | ReactiveValue<T> {
	return createComponentReactive(input, values);
}

registerComponentRuntimeSurface({
	reactive: { configurable: true, writable: true, value: reactive }
});
