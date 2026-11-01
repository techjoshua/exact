// @vitest-environment jsdom
import { createEffectScope } from '@exactjs/reactive';
import { registerEffectScopeCleanup } from '@exactjs/reactive/framework/runtime';
import { expect, it, vi } from 'vitest';
import type { Mounted } from '../types.js';
import { disposeMounted } from './teardown.js';

it.each([false, true])(
	'releases an owned subtree when suspension cancellation fails: %s',
	(fail) => {
		const container = document.createElement('div');
		const node = document.createElement('span');
		container.append(node);
		const cleanup = vi.fn();
		const scope = createEffectScope();
		registerEffectScopeCleanup(scope, cleanup);
		const cancel = vi.fn(() => {
			if (fail) throw new Error('suspension cancellation failed');
		});
		const mounted: Mounted = {
			dom: node,
			scope,
			children: [],
			suspensionRegistration: { boundaryGeneration: 1, settlement: new Promise(() => {}), cancel }
		};
		if (fail)
			expect(() => disposeMounted(container, mounted)).toThrow('suspension cancellation failed');
		else disposeMounted(container, mounted);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(scope.active).toBe(false);
		expect(container.childNodes).toHaveLength(0);
		expect(mounted.suspensionRegistration).toBeUndefined();
		disposeMounted(container, mounted);
		expect(cancel).toHaveBeenCalledOnce();
		expect(cleanup).toHaveBeenCalledOnce();
	}
);
