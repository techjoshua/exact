import type { Component } from '@exactjs/core';
import { createSelectedExternalSource, type ExternalSource } from '@exactjs/reactive';
import { createStore, type StateCreator, type StoreApi } from 'zustand/vanilla';

export { createStore };
export type { StateCreator, StoreApi };

/** Creates a zustand source. */
export function createZustandSource<T, Slice = T>(
	store: StoreApi<T>,
	selector: (state: T) => Slice = identity as (state: T) => Slice,
	equality: (left: Slice, right: Slice) => boolean = Object.is
): ExternalSource<Slice> {
	return createSelectedExternalSource({
		getSnapshot: store.getState,
		getServerSnapshot: store.getInitialState,
		subscribe: (notify) => store.subscribe(notify),
		selector,
		isEqual: equality
	});
}

/** Creates a component store. */
export function createComponentStore<T, Slice = T>(
	component: Component<any>,
	store: StoreApi<T>,
	selector?: (state: T) => Slice,
	equality?: (left: Slice, right: Slice) => boolean
): ExternalSource<Slice> {
	const source = createZustandSource(store, selector, equality);
	component.onUnmount(source.dispose);
	return source;
}

function identity<T>(value: T): T {
	return value;
}
