import { describe, expect, it, vi } from 'vitest';
import { flushSync } from '@exactjs/reactive';
import {
	constantContinuationDependency,
	createContinuationDependencySlot
} from './dependency-source.js';
import { watchContinuationDependencies } from './dependency-watcher.js';

describe('continuation dependency watcher', () => {
	it('distinguishes a pending input from an available undefined value', () => {
		const slot = createContinuationDependencySlot<undefined>();
		const ready = vi.fn();
		const unavailable = vi.fn();
		const watcher = watchContinuationDependencies([slot], {
			onReady: ready,
			onUnavailable: unavailable
		});

		watcher.evaluate();
		expect(ready).not.toHaveBeenCalled();
		expect(unavailable).toHaveBeenCalledWith(
			'pending',
			expect.objectContaining({ status: 'pending' })
		);

		const generation = slot.beginGeneration();
		slot.publish(generation, undefined);
		flushSync();
		expect(ready).toHaveBeenCalledOnce();
		expect(ready.mock.calls[0]![0].values).toEqual([undefined]);
		watcher[Symbol.dispose]();
	});

	it('coalesces several publications into one atomic version vector', () => {
		const left = createContinuationDependencySlot<number>();
		const right = createContinuationDependencySlot<string>();
		const leftGeneration = left.beginGeneration();
		const rightGeneration = right.beginGeneration();
		left.publish(leftGeneration, 1);
		right.publish(rightGeneration, 'one');
		const vectors: unknown[][] = [];
		const watcher = watchContinuationDependencies([left, right], {
			onReady: ({ values }) => vectors.push([...values]),
			onUnavailable() {}
		});
		watcher.evaluate();

		left.publish(leftGeneration, 2);
		right.publish(rightGeneration, 'two');
		flushSync();

		expect(vectors).toEqual([
			[1, 'one'],
			[2, 'two']
		]);
		watcher[Symbol.dispose]();
	});

	it('does not reissue an equal publication in the same generation', () => {
		const slot = createContinuationDependencySlot<object>();
		const value = {};
		const ready = vi.fn();
		const watcher = watchContinuationDependencies([slot], {
			onReady: ready,
			onUnavailable() {}
		});
		const generation = slot.beginGeneration();
		slot.publish(generation, value);
		flushSync();
		slot.publish(generation, value);
		flushSync();

		expect(ready).toHaveBeenCalledOnce();
		watcher[Symbol.dispose]();
	});

	it('withdraws the old value while a replacement generation is pending', () => {
		const slot = createContinuationDependencySlot<string>();
		const retainedGeneration = slot.beginGeneration();
		slot.publish(retainedGeneration, 'retained');
		const ready = vi.fn();
		const unavailable = vi.fn();
		const watcher = watchContinuationDependencies([slot], {
			onReady: ready,
			onUnavailable: unavailable
		});
		watcher.evaluate();
		const currentGeneration = slot.beginGeneration();
		flushSync();

		expect(ready).toHaveBeenCalledOnce();
		expect(unavailable).toHaveBeenLastCalledWith(
			'pending',
			expect.objectContaining({ generation: 2 })
		);
		slot.publish(currentGeneration, 'current');
		flushSync();
		expect(ready.mock.calls[1]![0].values).toEqual(['current']);
		watcher[Symbol.dispose]();
	});

	it('reports terminal sources and releases every subscription on disposal', () => {
		const slot = createContinuationDependencySlot<number>();
		const unavailable = vi.fn();
		const ready = vi.fn();
		const watcher = watchContinuationDependencies(
			[slot, constantContinuationDependency('constant')],
			{ onReady: ready, onUnavailable: unavailable }
		);
		watcher.evaluate();
		const generation = slot.beginGeneration();
		slot.fail(generation, new Error('upstream'));
		flushSync();
		expect(unavailable).toHaveBeenLastCalledWith(
			'failed',
			expect.objectContaining({ status: 'failed' })
		);

		watcher[Symbol.dispose]();
		slot.publish(generation, 1);
		flushSync();
		expect(ready).not.toHaveBeenCalled();
	});

	it('fences publication from a superseded producer generation', () => {
		const slot = createContinuationDependencySlot<string>();
		const stale = slot.beginGeneration();
		const current = slot.beginGeneration();

		expect(slot.publish(stale, 'stale')).toBe(false);
		expect(slot.read()).toEqual({ status: 'pending', generation: current, version: 0 });
		expect(slot.publish(current, 'current')).toBe(true);
		expect(slot.read()).toEqual({
			status: 'available',
			generation: current,
			version: 1,
			value: 'current'
		});
	});

	it('keeps allocation-free subscriber traversal stable during subscription changes', () => {
		const slot = createContinuationDependencySlot<number>();
		const generation = slot.beginGeneration();
		const calls: string[] = [];
		let later: Disposable | undefined;
		const first = slot.subscribe(() => {
			calls.push('first');
			later ??= slot.subscribe(() => calls.push('later'));
		});
		const removed = slot.subscribe(() => calls.push('removed'));
		const remover = slot.subscribe(() => {
			calls.push('remover');
			removed[Symbol.dispose]();
		});
		slot.publish(generation, 1);
		slot.publish(generation, 2);

		expect(calls).toEqual(['first', 'removed', 'remover', 'first', 'remover', 'later']);
		first[Symbol.dispose]();
		remover[Symbol.dispose]();
		later?.[Symbol.dispose]();
	});
});
