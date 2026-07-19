import { getDefaultStore, type Atom, type WritableAtom } from 'jotai/vanilla';
import { exposeExactComponent, useExactContext } from '@exact/react-compat/interop';
import { useSyncExternalStore, type ReactComponentType } from '@exact/react-compat';
import {
	ExactJotaiProvider,
	JotaiStoreContext,
	type ExactJotaiProviderProps,
	type Store
} from './index.js';

export const Provider: ReactComponentType<ExactJotaiProviderProps> = exposeExactComponent(
	ExactJotaiProvider,
	'JotaiProvider'
);

export function useStore(options?: Readonly<{ store?: Store }>): Store {
	if (options?.store) return options.store;
	try {
		return useExactContext(JotaiStoreContext);
	} catch {
		return getDefaultStore();
	}
}

export function useAtomValue<Value>(
	valueAtom: Atom<Value>,
	options?: Readonly<{ store?: Store }>
): Value {
	const store = useStore(options);
	return useSyncExternalStore(
		(callback) => store.sub(valueAtom, callback),
		() => store.get(valueAtom),
		() => store.get(valueAtom)
	);
}

export function useSetAtom<Value, Args extends unknown[], Result>(
	writableAtom: WritableAtom<Value, Args, Result>,
	options?: Readonly<{ store?: Store }>
): (...args: Args) => Result {
	const store = useStore(options);
	return (...args: Args) => store.set(writableAtom, ...args);
}

export function useAtom<Value, Args extends unknown[], Result>(
	writableAtom: WritableAtom<Value, Args, Result>,
	options?: Readonly<{ store?: Store }>
): readonly [Value, (...args: Args) => Result] {
	return [useAtomValue(writableAtom, options), useSetAtom(writableAtom, options)];
}
