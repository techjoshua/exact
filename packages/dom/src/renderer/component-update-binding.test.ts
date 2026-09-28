/** @vitest-environment jsdom */
import type { AnyComponentInstance } from '@exactjs/core';
import {
	exactComponentContract,
	exactComponentType
} from '@exactjs/core/framework/component-contracts';
import {
	batch,
	compiledReactivePropertyOperand,
	computed,
	createEffectScope,
	flushSync,
	updateIndexedReactiveValue
} from '@exactjs/reactive/framework/runtime';
import { indexedReactiveObjects } from '@exactjs/reactive/framework/indexed-objects';
import { describe, expect, it, vi } from 'vitest';
import type { Mounted } from '../types.js';
import { bindCompiledWideComponentUpdate } from './component-update-wide-binding.js';
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
				[0, 1, 0],
				[1, 2, 0]
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

	it('publishes every repeated region bound to the same generated target index', () => {
		const state = indexedReactiveObjects<{ count: number }>(['count']);
		state.count = 1;
		const apply = vi.fn();
		const updates = { bindings: [[0, 1, 0]] as const, apply };
		const scope = createEffectScope();
		const owner = { state, scope } as unknown as AnyComponentInstance;
		const releases: Array<{ stop(): void }> = [];
		const targets = [0, 1].map(() => {
			const mounted = { renderProgram: { parentInstance: owner } } as unknown as Mounted;
			const target = { mounted, stopBindings: releases, valid: true };
			bindCompiledStateComponentUpdate(target, 0, updates);
			return target;
		});

		state.count = 2;
		flushSync();
		expect(apply.mock.calls.map(([bound]) => bound)).toEqual([[targets[0]], [targets[1]]]);

		apply.mockClear();
		releases[0]!.stop();
		state.count = 3;
		flushSync();
		expect(apply).toHaveBeenCalledOnce();
		expect(apply).toHaveBeenCalledWith([targets[1]], 1, 0);
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
				[0, 2, 0],
				[0, 1, 0]
			] as const,
			props: 1,
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
			bindings: [[0, 1, 0]] as const,
			props: 1,
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

	it('subscribes a compact compiler property operand without a computed owner', () => {
		const source = indexedReactiveObjects<{ label: string }>(['label']);
		source.label = 'first';
		const props = indexedReactiveObjects<{ label: string }>(
			['label'],
			{},
			{
				label: [compiledReactivePropertyOperand, source, 'label']
			} as unknown as { label: string },
			true
		);
		const updates = {
			bindings: [[0, 1, 0]] as const,
			props: 1,
			apply: vi.fn()
		};
		const scope = createEffectScope();
		const owner = { state: {}, props, scope } as unknown as AnyComponentInstance;
		const mounted = { renderProgram: { parentInstance: owner } } as unknown as Mounted;
		const target = { mounted, stopBindings: [], valid: true };
		bindCompiledComponentUpdate(target, 0, updates);

		source.label = 'second';
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
				[0, 1, 0, 0],
				[1, 0, 0, 2]
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

// Child receipts carry an explicit update owner without a render-program wrapper.
it.each(['state', 'props'] as const)(
	'updates wide child receipts through their explicit %s owner',
	(source) => {
		const values = indexedReactiveObjects<{ first: number; last: number }>(['first', 'last']);
		values.first = 1;
		values.last = 1;
		const scope = createEffectScope();
		try {
			const owner = {
				state: source === 'state' ? values : {},
				props: source === 'props' ? values : {},
				scope
			} as unknown as AnyComponentInstance;
			const published: number[][] = [];
			const updates = {
				bindings: [
					[0, 1, 0, 0],
					[1, 0, 0, 2]
				] as const,
				words: 3,
				...(source === 'props' ? { props: 2 } : {}),
				apply: (_targets: unknown, low: number, high: number, words: Uint32Array) => {
					published.push([low, high, ...words]);
				}
			};
			const releases: Array<{ stop(): void }> = [];
			const target = { mounted: {} as Mounted, owner, stopBindings: releases, valid: true };
			if (source === 'props') bindCompiledWideComponentUpdate(target, 0, updates);
			else bindCompiledWideStateComponentUpdate(target, 0, updates);
			expect(target.valid).toBe(true);
			values.last = 2;
			flushSync();
			expect(published).toEqual([[0, 0, 2]]);
			values.first = 2;
			flushSync();
			expect(published).toEqual([
				[0, 0, 2],
				[1, 0, 0]
			]);
			for (const release of releases) release.stop();
			values.last = 3;
			flushSync();
			expect(published).toHaveLength(2);
		} finally {
			scope.stop();
		}
	}
);

it.each(['state', 'props'] as const)(
	'clears wide %s masks after a generated update fails',
	(source) => {
		const values = indexedReactiveObjects<{ first: number; last: number }>(['first', 'last']);
		values.first = 1;
		values.last = 1;
		const errors: unknown[] = [];
		const scope = createEffectScope(undefined, (error) => {
			errors.push(error);
		});
		try {
			const owner = {
				state: source === 'state' ? values : {},
				props: source === 'props' ? values : {},
				scope
			} as unknown as AnyComponentInstance;
			const published: number[][] = [];
			const failure = new Error('generated update failed');
			const updates = {
				bindings: [
					[0, 1, 0, 0],
					[1, 0, 0, 2]
				] as const,
				words: 3,
				...(source === 'props' ? { props: 2 } : {}),
				apply: (_targets: unknown, low: number, high: number, words: Uint32Array) => {
					published.push([low, high, ...words]);
					if (published.length === 1) throw failure;
				}
			};
			const target = { mounted: {} as Mounted, owner, stopBindings: [], valid: true };
			if (source === 'props') bindCompiledWideComponentUpdate(target, 0, updates);
			else bindCompiledWideStateComponentUpdate(target, 0, updates);
			values.last = 2;
			flushSync();
			expect(errors).toEqual([failure]);
			values.first = 2;
			flushSync();
			expect(published).toEqual([
				[0, 0, 2],
				[1, 0, 0]
			]);
		} finally {
			scope.stop();
		}
	}
);
