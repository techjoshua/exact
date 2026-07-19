import { createStore, type StoreApi, type StateCreator } from "zustand/vanilla";
import { createSelectedExternalSource, type ExternalSource } from "@exact/reactive";
import type { Component } from "@exact/core";

export { createStore };
export type { StateCreator, StoreApi };

export function createZustandSource<T, Slice = T>(
  store: StoreApi<T>,
  selector: (state: T) => Slice = identity as (state: T) => Slice,
  equality: (left: Slice, right: Slice) => boolean = Object.is
): ExternalSource<Slice> {
  return createSelectedExternalSource({
    getSnapshot: store.getState,
    getServerSnapshot: store.getInitialState,
    subscribe: notify => store.subscribe(notify),
    selector,
    isEqual: equality
  });
}

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

function identity<T>(value: T): T { return value; }
