import {
	activateTaskForHost,
	createCompiledRenderProgram,
	createCompiledVNode,
	defineTask,
	markIndependentAsyncSiblings,
	type Component,
	type TaskContext
} from '@exactjs/core';
import { expect, it, vi } from 'vitest';
import { renderToString, renderToStringAsync } from './index.js';
import { createVNode } from './test-support/native-vnode.js';

it('writes compiler-owned scalar programs directly and retains marker-mode fallback', () => {
	let constructions = 0;
	const program = createCompiledRenderProgram(
		'render-program:ssr',
		() => {
			constructions++;
			return {
				version: 1,
				id: 'render-program:ssr',
				namespace: 'html',
				template: '<span data-exact-id="planned">\ue000exact:0\ue001</span>',
				parts: ['<span data-exact-id="planned">', '</span>'],
				slots: [{ id: 'value', kind: 'text', path: [0] }],
				nodes: [{ id: 'planned', path: [], tag: 'span', namespace: 'html' }]
			};
		},
		[() => '<safe>'],
		() => createCompiledVNode('span', { 'data-exact-id': 'planned' }, '<safe>')
	);
	expect(renderToString(program, { markers: false }).html).toBe(
		'<span data-exact-id="planned">&lt;safe&gt;</span>'
	);
	expect(renderToString(program).html).toContain('<!--exact:cell:');
	createCompiledRenderProgram(
		'render-program:ssr',
		() => {
			throw new Error('cached program descriptor was reconstructed');
		},
		[() => 'second'],
		() => createCompiledVNode('span', null, 'second')
	);
	expect(constructions).toBe(1);
});

it('bounds compiler-proven sibling work while preserving source order', async () => {
	const releases: Array<() => void> = [];
	let started = 0;
	function Wait(this: Component<{}>, props: { label: string }) {
		activateTaskForHost(
			this,
			defineTask({}, async (_task: TaskContext) => {
				started++;
				await new Promise<void>((resolve) => releases.push(resolve));
			})
		);
		return () => createVNode('span', null, props.label);
	}
	const group = markIndependentAsyncSiblings(
		createVNode('div', null, ...['a', 'b', 'c', 'd'].map((label) => createVNode(Wait, { label })))
	);
	const rendering = renderToStringAsync(group, { markers: false, maxAsyncSsrConcurrency: 2 });
	await vi.waitFor(() => expect(started).toBe(2));
	releases.splice(0).forEach((release) => release());
	await vi.waitFor(() => expect(started).toBe(4));
	releases.splice(0).forEach((release) => release());
	await expect(rendering).resolves.toMatchObject({
		html: '<div><span>a</span><span>b</span><span>c</span><span>d</span></div>'
	});
});
