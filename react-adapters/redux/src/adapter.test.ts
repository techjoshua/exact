import { flushSync } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { createReduxSource, createReduxSubscription, type ReduxStore } from './index.js';

describe('@exactjs/redux', () => {
	it('bridges Redux-compatible stores without depending on React Redux', () => {
		let state = { count: 0 };
		const listeners = new Set<() => void>();
		const store: ReduxStore<typeof state, { type: 'increment' }> = {
			getState: () => state,
			dispatch() {
				state = { count: state.count + 1 };
				listeners.forEach((listener) => listener());
			},
			subscribe(listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			}
		};
		const source = createReduxSource(store, (value) => value.count);
		store.dispatch({ type: 'increment' });
		flushSync();
		expect(source.value.get()).toBe(1);
	});

	it('maintains nested provider subscription ordering and deterministic cleanup', () => {
		const listeners = new Set<() => void>();
		const store: ReduxStore<number> = {
			getState: () => 0,
			dispatch: () => undefined,
			subscribe(listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			}
		};
		const subscription = createReduxSubscription(store);
		const seen: string[] = [];
		subscription.addNestedSub(() => seen.push('first'));
		subscription.addNestedSub(() => seen.push('second'));
		listeners.forEach((listener) => listener());
		expect(seen).toEqual(['first', 'second']);
		subscription.tryUnsubscribe();
		expect(listeners.size).toBe(0);
	});
});
