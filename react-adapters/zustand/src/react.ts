import type { StoreApi } from 'zustand/vanilla';
import { useSyncExternalStore } from '@exact/react-compat';

/** React-compatible replacement backed only by Zustand's vanilla store API. */
export function useStore<T, Slice = T>(
	store: StoreApi<T>,
	selector: (state: T) => Slice = identity as (state: T) => Slice
): Slice {
	return useSyncExternalStore(
		store.subscribe,
		() => selector(store.getState()),
		() => selector(store.getInitialState())
	);
}

function identity<T>(value: T): T {
	return value;
}
