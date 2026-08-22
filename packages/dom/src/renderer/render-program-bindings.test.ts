/** @vitest-environment jsdom */
import type { AnyComponentInstance } from '@exactjs/core';
import {
	createPreparedRenderProgram,
	prepareCompiledRenderProgram,
	readRenderProgram
} from '@exactjs/core/runtime/render';
import { batch, createEffectScope, flushSync } from '@exactjs/reactive/framework/runtime';
import { indexedReactiveObjects } from '@exactjs/reactive/framework/indexed-objects';
import { describe, expect, it, vi } from 'vitest';
import type { Mounted } from '../types.js';
import {
	applyCompiledProgramText,
	bindCompiledProgramState,
	bindCompiledProgramText
} from './render-program-bindings.js';

describe('compiler-generated dirty updates', () => {
	it('coalesces changed state fields and applies only their generated operations', () => {
		const state = indexedReactiveObjects<{ count: number; label: string }>(['count', 'label']);
		state.count = 1;
		state.label = 'first';
		const count = document.createTextNode('');
		const label = document.createTextNode('');
		const updates = vi.fn();
		const program = prepareCompiledRenderProgram({
			version: 3,
			id: 'direct-dirty-update',
			namespace: 'html',
			template: '<p>\ue000exact:0\ue001 \ue000exact:1\ue001</p>',
			directClaims: true,
			bind() {},
			update(target, dirtyLow) {
				updates(dirtyLow);
				if (dirtyLow & 1) applyCompiledProgramText(target, 0);
				if (dirtyLow & 2) applyCompiledProgramText(target, 1);
			}
		});
		const vnode = createPreparedRenderProgram(program, [() => state.count, () => state.label]);
		const invocation = readRenderProgram(vnode)!;
		const scope = createEffectScope();
		const mounted = {
			scope,
			renderProgram: {
				invocation,
				programRoot: document.createElement('p'),
				slotNodes: [count, label],
				parentInstance: { state } as unknown as AnyComponentInstance
			}
		} as unknown as Mounted;
		const stopBindings: Array<{ stop(): void }> = [];
		const target = { mounted, initialBinding: true, stopBindings, valid: true };

		bindCompiledProgramText(target, 0, true);
		bindCompiledProgramText(target, 1, true);
		bindCompiledProgramState(target, [
			['count', 1, 0],
			['label', 2, 0]
		]);
		expect([count.data, label.data]).toEqual(['1', 'first']);

		batch(() => {
			state.count = 2;
			state.label = 'second';
		});
		flushSync();
		expect(updates).toHaveBeenLastCalledWith(3);
		expect([count.data, label.data]).toEqual(['2', 'second']);

		state.count = 3;
		flushSync();
		expect(updates).toHaveBeenLastCalledWith(1);
		expect(updates).toHaveBeenCalledTimes(2);
		expect([count.data, label.data]).toEqual(['3', 'second']);

		for (const binding of stopBindings) binding.stop();
		scope.stop();
	});
});
