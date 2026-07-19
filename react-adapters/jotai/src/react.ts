import { useSyncExternalStore, type ReactComponentType } from '@exact/react-compat';
import { exposeExactComponent, useExactContext } from '@exact/react-compat/interop';
import { getDefaultStore, type Atom, type WritableAtom } from 'jotai/vanilla';
import {
	ExactJotaiProvider,
	JotaiStoreContext,
	type ExactJotaiProviderProps,
	type Store
} from './adapter.js';

/** Provides the canonical provider value. */
export const Provider: ReactComponentType<ExactJotaiProviderProps> = exposeExactComponent(
	ExactJotaiProvider,
	'JotaiProvider'
);

/** Performs the use store domain operation. */
export function useStore(options?: Readonly<{ store?: Store }>): Store {
	if (options?.store) return options.store;
	try {
		return useExactContext(JotaiStoreContext);
	} catch {
		return getDefaultStore();
	}
}

/** Performs the use atom value domain operation. */
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

/** Performs the use set atom domain operation. */
export function useSetAtom<Value, Args extends unknown[], Result>(
	writableAtom: WritableAtom<Value, Args, Result>,
	options?: Readonly<{ store?: Store }>
): (...args: Args) => Result {
	const store = useStore(options);
	return (...args: Args) => store.set(writableAtom, ...args);
}

/** Performs the use atom domain operation. */
export function useAtom<Value, Args extends unknown[], Result>(
	writableAtom: WritableAtom<Value, Args, Result>,
	options?: Readonly<{ store?: Store }>
): readonly [Value, (...args: Args) => Result] {
	return [useAtomValue(writableAtom, options), useSetAtom(writableAtom, options)];
}
