import { batch } from './internal/deps.js';

import {
	currentEffectScope,
	registerEffectScopeCleanup,
	releaseEffectScopeCleanup
} from './internal/scopes.js';

import type { ReactiveValue, StopHandle } from './internal/types.js';

import { computed, reactive } from './observation.js';

/** Configures external source. */
export interface ExternalSourceOptions<T> {
	readonly getSnapshot: () => T;
	readonly subscribe: (notify: () => void) => StopHandle;
	readonly getServerSnapshot?: () => T;
	readonly isEqual?: (left: T, right: T) => boolean;
	readonly connect?: boolean;
}

/** Defines the external source interface contract. */
export interface ExternalSource<T> {
	readonly value: ReactiveValue<T>;
	readonly connected: boolean;
	readonly disposed: boolean;
	snapshot(): T;
	refresh(): T;
	connect(): StopHandle;
	dispose(): void;
}

/** Bridges a subscribe/getSnapshot contract into eXact's reactive graph. */
export function createExternalSource<T>(options: ExternalSourceOptions<T>): ExternalSource<T> {
	const serverSnapshot = !('window' in globalThis) && options.getServerSnapshot !== undefined;
	let current = serverSnapshot ? options.getServerSnapshot() : options.getSnapshot();
	const state = reactive({ revision: 0 });
	let stop: StopHandle | undefined;
	let disposed = false;
	const ownerScope = currentEffectScope();
	const refresh = (): T => {
		if (disposed) return current;
		const next = options.getSnapshot();
		if (!(options.isEqual ?? Object.is)(current, next)) {
			current = next;
			batch(() => {
				state.revision++;
			});
		}
		return current;
	};
	const source: ExternalSource<T> = {
		value: computed(() => {
			void state.revision;
			return current;
		}),
		get connected() {
			return stop !== undefined;
		},
		get disposed() {
			return disposed;
		},
		snapshot: () => current,
		refresh,
		connect() {
			if (disposed) throw new Error('Cannot reconnect a disposed external source');
			if (stop) return source.dispose;
			refresh();
			const unsubscribe = options.subscribe(refresh);
			if (typeof unsubscribe !== 'function')
				throw new TypeError('External source subscribe must return an unsubscribe function');
			let active = true;
			stop = () => {
				if (!active) return;
				active = false;
				unsubscribe();
			};
			refresh();
			return source.dispose;
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			if (ownerScope) releaseEffectScopeCleanup(ownerScope, source.dispose);
			const unsubscribe = stop;
			stop = undefined;
			unsubscribe?.();
		}
	};
	if (ownerScope) registerEffectScopeCleanup(ownerScope, source.dispose);
	if (options.connect ?? !serverSnapshot) source.connect();
	return Object.freeze(source);
}

/** Options for adapting a selected view of an external state container. */
export interface SelectedExternalSourceOptions<State, Selected> {
	readonly getSnapshot: () => State;
	readonly subscribe: (notify: () => void) => StopHandle;
	readonly selector: (state: State) => Selected;
	readonly getServerSnapshot?: () => State;
	readonly isEqual?: (left: Selected, right: Selected) => boolean;
	readonly connect?: boolean;
}

/**
 * Creates an external source for a selected view of container state.
 *
 * Selection and equality semantics live here so store adapters cannot drift in
 * how they retain stable snapshots or initialize server rendering.
 */
export function createSelectedExternalSource<State, Selected>(
	options: SelectedExternalSourceOptions<State, Selected>
): ExternalSource<Selected> {
	return createExternalSource({
		getSnapshot: () => options.selector(options.getSnapshot()),
		subscribe: options.subscribe,
		...(options.getServerSnapshot
			? { getServerSnapshot: () => options.selector(options.getServerSnapshot!()) }
			: {}),
		isEqual: options.isEqual,
		connect: options.connect
	});
}
