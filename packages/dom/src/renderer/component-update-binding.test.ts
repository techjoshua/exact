/** @vitest-environment jsdom */
import type { AnyComponentInstance } from '@exactjs/core';
import {
	exactComponentContract,
	exactComponentType
} from '@exactjs/core/framework/component-contracts';
import { batch, createEffectScope, flushSync } from '@exactjs/reactive/framework/runtime';
import { indexedReactiveObjects } from '@exactjs/reactive/framework/indexed-objects';
import { describe, expect, it, vi } from 'vitest';
import type { Mounted } from '../types.js';
import { bindCompiledComponentUpdate } from './component-update-binding.js';

describe('compiler-generated component updates', () => {
	it('shares one fixed dependency reaction across indexed region targets', () => {
		const state = indexedReactiveObjects<{ count: number; label: string }>(['count', 'label']);
		state.count = 1;
		state.label = 'first';
		const apply = vi.fn();
		const updates = {
			bindings: [
				['count', 1, 0],
				['label', 2, 0]
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
			bindCompiledComponentUpdate(target, index, updates);
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
});
