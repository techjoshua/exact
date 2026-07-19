import { createContext, type Child, type Component } from '@exact/core';
import { createExternalSource, type ExternalSource } from '@exact/reactive';
import { atom, createStore, getDefaultStore, type Atom } from 'jotai/vanilla';

export { atom, createStore, getDefaultStore };
export type { Atom };
export type Store = ReturnType<typeof createStore>;

export const JotaiStoreContext = createContext<Store>('exact.jotai.store', { reactive: false });

export interface ExactJotaiProviderProps {
	readonly store?: Store;
	readonly children?: Child | readonly Child[];
}

export function ExactJotaiProvider(
	this: Component<Record<string, unknown>>,
	props: ExactJotaiProviderProps
) {
	this.setContext(JotaiStoreContext, props.store ?? getDefaultStore());
	return () => props.children ?? null;
}

export function createAtomSource<Value>(
	store: Store,
	valueAtom: Atom<Value>
): ExternalSource<Value> {
	return createExternalSource({
		getSnapshot: () => store.get(valueAtom),
		subscribe: (notify) => store.sub(valueAtom, notify)
	});
}

export function createComponentAtom<Value>(
	component: Component<any>,
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
