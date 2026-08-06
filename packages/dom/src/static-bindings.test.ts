/**
 * @vitest-environment jsdom
 */
import { createExpression } from '@exactjs/core';
import { flushSync, reactive } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { render, unmount } from './index.js';
import { propBindings, roots } from './state.js';
import { createVNode } from './test-support/native-vnode.js';
import type { Mounted } from './types.js';

describe('@exactjs/dom static bindings', () => {
	it('does not retain property or text watchers that observed no dependencies', () => {
		const container = document.createElement('div');
		render(
			createVNode('div', { title: 'Account', style: 'color: red' }, 'Static label'),
			container
		);
		const element = container.querySelector('div')!;
		const text = element.firstChild!;

		expect(propBindings.has(element)).toBe(false);
		expect(findMounted(roots.get(container)!.mounted!, text)?.stop).toBeUndefined();
		unmount(container);
	});

	it('retains bindings that observe dependencies and releases them after they become static', () => {
		const state = reactive({ enabled: true, title: 'First' });
		const container = document.createElement('div');
		render(
			createVNode('div', {
				title: createExpression(() => (state.enabled ? state.title : 'Final'))
			}),
			container
		);
		const element = container.querySelector('div')!;

		expect(propBindings.get(element)?.has('title')).toBe(true);
		state.title = 'Second';
		flushSync();
		expect(element.title).toBe('Second');

		state.enabled = false;
		flushSync();
		expect(element.title).toBe('Final');
		unmount(container);
	});
});

function findMounted(mounted: Mounted, node: Node): Mounted | undefined {
	if (mounted.dom === node) return mounted;
	for (const child of mounted.children) {
		const found = findMounted(child, node);
		if (found) return found;
	}
	return undefined;
}
