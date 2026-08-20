import { createContext, type Child, type Component } from '@exactjs/core';
import { markExactComponent } from '@exactjs/core/framework/component-contracts';
import { createExternalSource, type ExternalSource } from '@exactjs/reactive';
import { atom, createStore, getDefaultStore, type Atom } from 'jotai/vanilla';

export { atom, createStore, getDefaultStore };
export type { Atom };
/** Defines the store type contract. */
export type Store = ReturnType<typeof createStore>;

/** Provides the canonical jotai store context value. */
export const JotaiStoreContext = createContext<Store>('exact.jotai.store', { reactive: false });

/** Defines the properties accepted by exact jotai provider. */
export interface ExactJotaiProviderProps {
	readonly store?: Store;
	readonly children?: Child | readonly Child[];
}

/** Performs the exact jotai provider domain operation. */
export function ExactJotaiProvider(
	this: Component<Record<string, unknown>>,
	props: ExactJotaiProviderProps
) {
	this.setContext(JotaiStoreContext, props.store ?? getDefaultStore());
	return () => props.children ?? null;
}
markExactComponent(ExactJotaiProvider, '@exactjs/jotai:ExactJotaiProvider');

/** Creates an atom source. */
export function createAtomSource<Value>(
	store: Store,
	valueAtom: Atom<Value>
): ExternalSource<Value> {
	return createExternalSource({
		getSnapshot: () => store.get(valueAtom),
		subscribe: (notify) => store.sub(valueAtom, notify)
	});
}

/** Creates a component atom. */
export function createComponentAtom<Value>(
	component: Component<object>,
	valueAtom: Atom<Value>,
	store?: Store
): ExternalSource<Value> {
	let resolved = store;
	if (!resolved) {
		try {
			resolved = component.getContext(JotaiStoreContext);
		} catch {
			resolved = getDefaultStore();
		}
	}
	const source = createAtomSource(resolved, valueAtom);
	component.onUnmount(source.dispose);
	return source;
}
