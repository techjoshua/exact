import {
	activateTaskForHost,
	defineTask,
	markIndependentAsyncSiblings,
	type Component,
	type TaskContext
} from '@exactjs/core';
import { createDynamicChild, createCompiledVNode } from '@exactjs/core/runtime/render';
import { createCompiledRenderProgram } from '@exactjs/core/runtime/render';
import { createEffectScope, type EffectScope } from '@exactjs/reactive';
import { expect, it, vi } from 'vitest';
import { renderToString, renderToStringAsync } from './index.js';
import { createVNode } from './test-support/native-vnode.js';

it('writes compiler-owned scalar programs directly with hydration markers', () => {
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
				slots: [['text', 'value', [0], [0]]],
				nodes: [['planned', [], [], 'span']],
				ssrParts: ['', '<span data-exact-id="planned">', '', '</span>', ''],
				ssrOperations: [
					{ kind: 'node-open', index: 0 },
					{ kind: 'slot', index: 0 },
					{ kind: 'node-close', index: 0 }
				]
			};
		},
		[() => '<safe>'],
		() =>
			createCompiledVNode(
				'span',
				{ 'data-exact-id': 'planned' },
				createDynamicChild(() => '<safe>', 'value')
			)
	);
	expect(renderToString(program, { markers: false }).html).toBe(
		'<span data-exact-id="planned">&lt;safe&gt;</span>'
	);
	expect(renderToString(program).html).toBe(
		'<!--exact:cell:0--><span data-exact-id="planned"><!--exact:dynamic:value-->&lt;safe&gt;<!--/exact:dynamic:value--></span><!--/exact:cell:0-->'
	);
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

it('serializes planned host slots with ordinary SSR attribute semantics', () => {
	const program = createCompiledRenderProgram(
		'render-program:ssr-props',
		() => ({
			version: 1,
			id: 'render-program:ssr-props',
			namespace: 'html',
			template: '<button data-exact-id="planned">Save</button>',
			parts: ['<button data-exact-id="planned"', '', '', '>Save</button>'],
			slots: [
				['class', [], [], 'className'],
				['property', [], [], 'disabled'],
				['property', [], [], 'onClick']
			],
			nodes: [['planned', [], [], 'button']]
		}),
		[() => ['primary', { active: true }], () => true, () => () => undefined],
		() => createCompiledVNode('button', { className: 'primary active', disabled: true }, 'Save')
	);
	expect(renderToString(program, { markers: false }).html).toBe(
		'<button data-exact-id="planned" class="primary active" disabled>Save</button>'
	);
});

it('materializes marker-mode program fallbacks inside their component scope', async () => {
	let fallbackScope: EffectScope | undefined;
	function ProgramOwner() {
		return () =>
			createCompiledRenderProgram(
				'render-program:ssr-owned-fallback',
				() => ({
					version: 1,
					id: 'render-program:ssr-owned-fallback',
					namespace: 'html',
					template: '<span>owned</span>',
					parts: ['<span>owned</span>'],
					slots: [],
					nodes: [['owned', [], [], 'span']]
				}),
				[],
				() => {
					fallbackScope = createEffectScope();
					return createCompiledVNode('span', null, 'owned');
				}
			);
	}

	const rendered = await renderToStringAsync(createVNode(ProgramOwner, {}));

	expect(rendered.html).toContain('owned');
	expect(fallbackScope?.active).toBe(false);
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

it('shares the request limit with nested proven sibling groups without deadlocking', async () => {
	function Leaf(this: Component<{}>, props: { label: string; delay: number }) {
		activateTaskForHost(
			this,
			defineTask({}, async () => {
				await new Promise<void>((resolve) => setTimeout(resolve, props.delay));
			})
		);
		return () => createVNode('span', null, props.label);
	}
	function Pair(this: Component<{}>, props: { prefix: string }) {
		return () =>
			markIndependentAsyncSiblings(
				createVNode(
					'section',
					null,
					createVNode(Leaf, { label: `${props.prefix}1`, delay: 4 }),
					createVNode(Leaf, { label: `${props.prefix}2`, delay: 1 })
				)
			);
	}
	const root = markIndependentAsyncSiblings(
		createVNode(
			'main',
			null,
			createVNode(Pair, { prefix: 'a' }),
			createVNode(Pair, { prefix: 'b' })
		)
	);
	await expect(
		renderToStringAsync(root, { markers: false, maxAsyncSsrConcurrency: 2 })
	).resolves.toMatchObject({
		html: '<main><section><span>a1</span><span>a2</span></section><section><span>b1</span><span>b2</span></section></main>'
	});
});
