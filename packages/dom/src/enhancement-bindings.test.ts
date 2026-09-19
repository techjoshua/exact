// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { reactive } from '@exactjs/reactive';
import { createEffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted } from './types.js';
import { createRendererRoot } from './renderer/root-construction.js';
import { mountDetachedChildren } from './renderer/mounting/children.js';
import { patchChildren } from './renderer/patching/children.js';
import { placeMountedBefore } from './placement.js';
import { disposeMounted } from './renderer/teardown.js';
import { registerDomEnhancementIntegration } from './renderer/enhancement-integration.js';
import {
	readEnhancementBinding,
	invalidateEnhancementBindings
} from './renderer/enhancement-bindings.js';

describe('retained namespace selections', () => {
	it('does no namespace discovery or application reconciliation for an existing Text update', () => {
		registerDomEnhancementIntegration();
		const container = document.createElement('div');
		const root = createRendererRoot(container, null, {}, { version: 1 });
		const scope = createEffectScope();
		const owner: Mounted = { dom: document.createComment('range'), scope, children: [] };
		owner.children = mountDetachedChildren(root, ['first'], undefined, scope, container);
		for (const child of owner.children) placeMountedBefore(root, container, child);
		let visits = 0;
		let reconciliations = 0;
		root.reconcileEnhancements = () => {
			reconciliations++;
		};
		const read = () =>
			readEnhancementBinding(owner, 'test:motion', (dependencies) => {
				visits++;
				dependencies.add(owner);
				return { mounted: owner.children[0]!, depth: 1 };
			});
		try {
			const target = read();
			owner.children = patchChildren(
				root,
				container,
				owner.children,
				['second'],
				undefined,
				scope,
				null,
				owner
			);
			expect(container.textContent).toBe('second');
			expect(read()).toBe(target);
			expect(visits).toBe(1);
			expect(reconciliations).toBe(0);
		} finally {
			for (const child of owner.children) disposeMounted(container, child);
			scope.stop();
		}
	});
	it('resolves only selector and owned structural changes, and releases dependency edges', () => {
		const scope = createEffectScope();
		const boundary: Mounted = { dom: document.createComment('owner'), scope, children: [] };
		const changed: Mounted = { dom: document.createComment('range'), scope, children: [] };
		const unrelated: Mounted = { dom: document.createComment('unrelated'), scope, children: [] };
		const selector = reactive({ active: true });
		let visits = 0;
		const resolve = (dependencies: Set<Mounted>) => {
			visits++;
			dependencies.add(changed);
			return selector.active ? { mounted: changed, depth: 1 } : undefined;
		};
		const read = () => readEnhancementBinding(boundary, 'test:motion', resolve);
		try {
			const initial = read();
			for (let index = 0; index < 1000; index++) expect(read()).toBe(initial);
			expect(visits).toBe(1);
			invalidateEnhancementBindings(unrelated);
			expect(read()).toBe(initial);
			expect(visits).toBe(1);
			selector.active = false;
			expect(read()).toBeUndefined();
			expect(visits).toBe(2);
			invalidateEnhancementBindings(changed);
			expect(read()).toBeUndefined();
			expect(visits).toBe(3);
		} finally {
			scope.stop();
		}
		invalidateEnhancementBindings(changed);
		expect(visits).toBe(3);
	});
});
