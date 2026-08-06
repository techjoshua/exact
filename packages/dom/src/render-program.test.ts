/** @vitest-environment jsdom */
import { createCompiledRenderProgram, createCompiledVNode } from '@exactjs/core';
import { flushSync, reactive } from '@exactjs/reactive';
import { expect, it } from 'vitest';
import { render } from './index.js';

it('clones one compiler template and updates scalar slots without a generic vnode subtree', () => {
	const state = reactive({ label: 'first' });
	const vnode = createCompiledRenderProgram(
		'render-program:test',
		() => ({
			version: 1,
			id: 'render-program:test',
			namespace: 'html',
			template: '<span data-exact-id="planned">\ue000exact:0\ue001</span>',
			parts: ['<span data-exact-id="planned">', '</span>'],
			slots: [{ id: 'label', kind: 'text', path: [0] }],
			nodes: [{ id: 'planned', path: [], tag: 'span', namespace: 'html' }]
		}),
		[() => state.label],
		() => createCompiledVNode('span', { 'data-exact-id': 'planned' }, state.label)
	);
	const container = document.createElement('div');
	render(vnode, container);
	expect(container.textContent).toBe('first');
	state.label = 'second';
	flushSync();
	expect(container.textContent).toBe('second');
});
