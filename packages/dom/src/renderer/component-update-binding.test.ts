/** @vitest-environment jsdom */
import type { AnyComponentInstance } from '@exactjs/core';
import {
	exactComponentContract,
	exactComponentType
} from '@exactjs/core/framework/component-contracts';
import {
	batch,
	computed,
	createEffectScope,
	flushSync,
	updateIndexedReactiveValue
} from '@exactjs/reactive/framework/runtime';
import { indexedReactiveObjects } from '@exactjs/reactive/framework/indexed-objects';
import { describe, expect, it, vi } from 'vitest';
import type { Mounted } from '../types.js';
import { bindCompiledComponentUpdate } from './component-update-binding.js';
import {
	bindCompiledStateComponentUpdate,
	bindCompiledWideStateComponentUpdate
} from './component-state-update-binding.js';

describe('compiler-generated component updates', () => {
	it('shares one fixed dependency reaction across indexed region targets', () => {
		const state = indexedReactiveObjects<{ count: number; label: string }>(['count', 'label']);
		state.count = 1;
		state.label = 'first';
		const apply = vi.fn();
		const updates = {
			bindings: [
				['state', 'count', 1, 0],
				['state', 'label', 2, 0]
			] as const,
			apply
		};
		const type = Object.assign(() => () => null, {
			[exactComponentType]: 'test:component-updates',
			[exactComponentContract]: {
				definition: {
					updates
				}
			}
		});
		const scope = createEffectScope();
		const owner = { type, state, scope } as unknown as AnyComponentInstance;
		const releases: Array<{ stop(): void }> = [];
		const targets = [0, 1].map((index) => {
			const mounted = {
				renderProgram: { parentInstance: owner }
			} as unknown as Mounted;
			const target = { mounted, stopBindings: releases, valid: true };
			bindCompiledStateComponentUpdate(target, index, updates);
			return target;
		});

		const reactions = (scope as unknown as { reactions: Set<unknown> }).reactions;
		expect(reactions.size).toBe(1);
		batch(() => {
			state.count = 2;
			state.label = 'second';
		});
		flushSync();
		expect(apply).toHaveBeenCalledWith(targets, 3, 0);

		releases[0]!.stop();
		state.label = 'third';
		flushSync();
		expect(apply).toHaveBeenLastCalledWith([undefined, targets[1]], 2, 0);
		scope.stop();
	});

	it('subscribes source-qualified prop dependencies without a generic watcher', () => {
		const state = indexedReactiveObjects<{ count: number }>(['count']);
		const parent = indexedReactiveObjects<{ label: string }>(['label']);
		parent.label = 'first';
		const props = indexedReactiveObjects<{ label: string }>(
			['label'],
			{},
			{ label: computed(() => parent.label) } as unknown as { label: string },
			true
		);
		state.count = 1;
		const apply = vi.fn();
		const updates = {
			bindings: [
				['state', 'count', 1, 0],
				['props', 'label', 2, 0]
			] as const,
			apply
		};
		const scope = createEffectScope();
		const owner = { state, props, scope } as unknown as AnyComponentInstance;
		const mounted = { renderProgram: { parentInstance: owner } } as unknown as Mounted;
		const target = { mounted, stopBindings: [], valid: true };
		bindCompiledComponentUpdate(target, 0, updates);

		parent.label = 'second';
		flushSync();
		expect(apply).toHaveBeenLastCalledWith([target], 2, 0);
		state.count = 2;
		flushSync();
		expect(apply).toHaveBeenLastCalledWith([target], 1, 0);
		scope.stop();
	});

	it('transfers a generated prop binding when its forwarded source changes', () => {
		const first = indexedReactiveObjects<{ label: string }>(['label']);
		const second = indexedReactiveObjects<{ label: string }>(['label']);
		first.label = 'first';
		second.label = 'second';
		const props = indexedReactiveObjects<{ label: string }>(
			['label'],
			{},
			{ label: computed(() => first.label) } as unknown as { label: string },
			true
		);
		const updates = {
			bindings: [['props', 'label', 1, 0]] as const,
			apply: vi.fn()
		};
		const scope = createEffectScope();
		const owner = { state: {}, props, scope } as unknown as AnyComponentInstance;
		const mounted = { renderProgram: { parentInstance: owner } } as unknown as Mounted;
		const target = { mounted, stopBindings: [], valid: true };
		bindCompiledComponentUpdate(target, 0, updates);

		updateIndexedReactiveValue(props, 0, () => computed(() => second.label));
		flushSync();
		expect(updates.apply).toHaveBeenLastCalledWith([target], 1, 0);
		updates.apply.mockClear();

		first.label = 'stale';
		flushSync();
		expect(updates.apply).not.toHaveBeenCalled();
		second.label = 'current';
		flushSync();
		expect(updates.apply).toHaveBeenLastCalledWith([target], 1, 0);
		scope.stop();
	});

	it('publishes compiler-selected operation words beyond the first 64 operations', () => {
		const state = indexedReactiveObjects<{ first: number; last: number }>(['first', 'last']);
		state.first = 1;
		state.last = 1;
		const published: Array<readonly [number, number, number[]]> = [];
		const apply = vi.fn(
			(
				_targets: readonly (object | undefined)[],
				low: number,
				high: number,
				words: Uint32Array
			) => {
				published.push([low, high, [...(words ?? [])]]);
			}
		);
		const updates = {
			bindings: [
				['state', 'first', 1, 0, 0],
				['state', 'last', 0, 0, 2]
			] as const,
			words: 3,
			apply
		};
		const scope = createEffectScope();
		const owner = { state, scope } as unknown as AnyComponentInstance;
		const mounted = { renderProgram: { parentInstance: owner } } as unknown as Mounted;
		const target = { mounted, stopBindings: [], valid: true };
		bindCompiledWideStateComponentUpdate(target, 0, updates);

		batch(() => {
			state.first = 2;
			state.last = 2;
		});
		flushSync();
		expect(apply).toHaveBeenCalledTimes(1);
		expect(apply.mock.calls[0]![0]).toEqual([target]);
		expect(published[0]).toEqual([1, 0, [2]]);

		state.last = 3;
		flushSync();
		expect(published[1]).toEqual([0, 0, [2]]);
		scope.stop();
	});
});
