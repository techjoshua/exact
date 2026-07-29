import { updateReactive, type Reactive } from '@exactjs/reactive';

import type { ComponentContextValues, ComponentInstance, ContextToken } from './contracts.js';
import { defaultContexts } from './plugins.js';
import { reactiveValue } from './reactive-value.js';

/** Reports whether a component can resolve a context without materializing its value. */
export function hasComponentContext(
	instance: ComponentInstance<any>,
	ambientContexts: ComponentContextValues | undefined,
	token: ContextToken<unknown>
): boolean {
	for (let cursor = instance.parent; cursor; cursor = cursor.parent)
		if (cursor.contexts.has(token.id)) return true;
	return ambientContexts?.has(token.id) === true || defaultContexts.has(token.id);
}

/** Resolves a context through logical parents, the ambient root, and framework defaults. */
export function getComponentContext<T>(
	instance: ComponentInstance<any>,
	ambientContexts: ComponentContextValues | undefined,
	token: ContextToken<T>
): Reactive<T> {
	for (let cursor = instance.parent; cursor; cursor = cursor.parent) {
		if (cursor.contexts.has(token.id)) return cursor.contexts.get(token.id) as Reactive<T>;
	}

	if (ambientContexts?.has(token.id)) {
		const value = ambientContexts.get(token.id) as T;
		return (token.reactive ? reactiveValue(value) : value) as Reactive<T>;
	}

	if (defaultContexts.has(token.id)) {
		const value = defaultContexts.get(token.id) as T;
		return (token.reactive ? reactiveValue(value) : value) as Reactive<T>;
	}

	throw new Error(`Context "${token.description}" was not provided`);
}

/** Publishes a component-owned context while preserving existing reactive object identity. */
export function setComponentContext<T>(
	instance: ComponentInstance<any>,
	token: ContextToken<T>,
	value: T
): void {
	const existing = instance.contexts.get(token.id);
	if (
		token.reactive &&
		existing &&
		typeof existing === 'object' &&
		value &&
		typeof value === 'object'
	) {
		updateReactive(existing as Reactive<object>, value as object);
		return;
	}
	instance.contexts.set(token.id, token.reactive ? reactiveValue(value) : (value as Reactive<T>));
}
