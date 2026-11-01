import { describe, expect, it, vi } from 'vitest';
import * as api from './index.js';
import { verifyExternalSourceLifecycle } from '../../component-composition-corpus/test-support/external-source-lifecycle-journey.mjs';
import {
	createEffectScope,
	createExternalSource,
	flushSync,
	watch,
	withEffectScope
} from './index.js';

describe('external source bridge', () => {
	it('keeps source methods writable under their ordinary TypeScript contract', () => {
		const source = createExternalSource({
			connect: false,
			getSnapshot: () => 1,
			subscribe: () => () => {}
		});
		source.snapshot = () => 2;
		expect(source.snapshot()).toBe(2);
		source.dispose();
	});
	it('executes the shared native and browser lifecycle journey', () =>
		verifyExternalSourceLifecycle(api));
	it.each([false, true])('preserves an accepted snapshot identity, observed=%s', (observed) => {
		let snapshot = { count: 1 };
		let notify!: () => void;
		const source = createExternalSource({
			getSnapshot: () => snapshot,
			subscribe(callback) {
				notify = callback;
				return () => {};
			}
		});
		const stop = observed ? watch(() => source.value.get()) : () => {};
		try {
			expect(source.value.get()).toBe(snapshot);
			snapshot = { count: 1 };
			notify();
			flushSync();
			expect(source.snapshot()).toBe(snapshot);
			expect(source.value.get()).toBe(snapshot);
		} finally {
			stop();
			source.dispose();
		}
	});

	it('does not acquire a subscription after the initial connection read disposes its source', () => {
		const subscribe = vi.fn(() => () => {});
		let reads = 0;
		const source = createExternalSource({
			connect: false,
			getSnapshot() {
				if (++reads > 1) source.dispose();
				return reads;
			},
			subscribe
		});
		source.connect();
		expect(subscribe).not.toHaveBeenCalled();
		expect(source.snapshot()).toBe(1);
	});

	it('releases a subscription acquired after synchronous source disposal', () => {
		const unsubscribe = vi.fn();
		const source = createExternalSource({
			connect: false,
			getSnapshot: () => 1,
			subscribe() {
				source.dispose();
				return unsubscribe;
			}
		});
		source.connect();
		expect(source.disposed).toBe(true);
		expect(source.connected).toBe(false);
		expect(unsubscribe).toHaveBeenCalledOnce();
	});

	it('releases a subscription returned after its setup scope stops', () => {
		const scope = createEffectScope();
		const unsubscribe = vi.fn();
		const source = withEffectScope(scope, () =>
			createExternalSource({
				getSnapshot: () => 1,
				subscribe() {
					scope.stop();
					return unsubscribe;
				}
			})
		);
		expect(source.disposed).toBe(true);
		expect(source.connected).toBe(false);
		expect(unsubscribe).toHaveBeenCalledOnce();
	});

	it('rolls back a failed connection and permits a subsequent attempt', () => {
		const failure = new Error('snapshot failed');
		const unsubscribe = vi.fn();
		let subscribed = false;
		let failing = true;
		const source = createExternalSource({
			connect: false,
			getSnapshot() {
				if (subscribed && failing) throw failure;
				return 1;
			},
			subscribe() {
				subscribed = true;
				return unsubscribe;
			}
		});
		expect(() => source.connect()).toThrow(failure);
		expect(source.connected).toBe(false);
		expect(unsubscribe).toHaveBeenCalledOnce();
		failing = false;
		source.connect();
		expect(source.connected).toBe(true);
		source.dispose();
		expect(unsubscribe).toHaveBeenCalledTimes(2);
	});

	it('coalesces a reentrant connect into the connection being acquired', () => {
		const unsubscribe = vi.fn();
		let subscriptions = 0;
		const source = createExternalSource({
			connect: false,
			getSnapshot: () => 1,
			subscribe() {
				if (++subscriptions === 1) source.connect();
				return unsubscribe;
			}
		});
		source.connect();
		expect(subscriptions).toBe(1);
		source.dispose();
		expect(unsubscribe).toHaveBeenCalledOnce();
	});

	it('tracks snapshots, closes the subscribe race, and disposes once', () => {
		let value = 1;
		let notify = () => {};
		const unsubscribe = vi.fn();
		const source = createExternalSource({
			getSnapshot: () => value,
			subscribe(callback) {
				notify = callback;
				value = 2;
				return unsubscribe;
			}
		});
		const seen: number[] = [];
		watch(
			() => source.value.get(),
			() => seen.push(source.value.get())
		);
		expect(source.snapshot()).toBe(2);
		value = 3;
		notify();
		flushSync();
		expect(seen).toEqual([3]);
		source.dispose();
		source.dispose();
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	it('supports lazy connection and rejects reconnecting after disposal', () => {
		const source = createExternalSource({
			getSnapshot: () => 'ready',
			subscribe: () => () => {},
			connect: false
		});
		expect(source.connected).toBe(false);
		source.connect();
		expect(source.connected).toBe(true);
		source.dispose();
		expect(() => source.connect()).toThrow(/disposed external source/);
	});

	it('disposes with its owning effect scope', () => {
		const unsubscribe = vi.fn();
		const scope = createEffectScope();
		const source = withEffectScope(scope, () =>
			createExternalSource({ getSnapshot: () => 1, subscribe: () => unsubscribe })
		);
		scope.stop();
		expect(source.disposed).toBe(true);
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	it('uses an inert server snapshot until explicitly connected', () => {
		const subscribe = vi.fn(() => () => {});
		const source = createExternalSource({
			getSnapshot: () => 'client',
			getServerSnapshot: () => 'server',
			subscribe
		});
		expect(source.snapshot()).toBe('server');
		expect(source.connected).toBe(false);
		expect(subscribe).not.toHaveBeenCalled();
		source.connect();
		expect(source.snapshot()).toBe('client');
	});

	it('supports source-defined equality without notifying', () => {
		let snapshot = { value: 1 };
		let notify = () => {};
		const source = createExternalSource({
			getSnapshot: () => snapshot,
			subscribe(callback) {
				notify = callback;
				return () => {};
			},
			isEqual: (left, right) => left.value === right.value
		});
		const seen: number[] = [];
		watch(
			() => source.value.get(),
			() => seen.push(source.value.get().value)
		);
		snapshot = { value: 1 };
		notify();
		flushSync();
		expect(seen).toEqual([]);
	});
});
