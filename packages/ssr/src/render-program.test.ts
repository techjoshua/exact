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

it('writes compiler-owned scalar programs without redundant hydration delimiters', () => {
	let constructions = 0;
	const program = createCompiledRenderProgram(
		'render-program:ssr',
		() => {
			constructions++;
			return {
				version: 3,
				id: 'render-program:ssr',
				namespace: 'html',
				ssr(target) {
					target.prepareText(0);
					target.begin(1, 1);
					target.static('<span data-exact-id="planned">');
					target.text(0, 'value', true);
					target.static('</span>');
				}
			};
		},
		[() => '<safe>'],
		() => {
			throw new Error('valid generated SSR lane used its generic fallback');
		}
	);
	expect(renderToString(program, { markers: false }).html).toBe(
		'<span data-exact-id="planned">&lt;safe&gt;</span>'
	);
	expect(renderToString(program).html).toBe('<span data-exact-id="planned">&lt;safe&gt;</span>');
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

it('preflights generated server slots before selecting the local fallback', () => {
	let reads = 0;
	const program = createCompiledRenderProgram(
		'render-program:ssr-preflight',
		() => ({
			version: 3,
			id: 'render-program:ssr-preflight',
			namespace: 'html',
			ssr(target) {
				target.prepareText(0);
				target.prepareText(1);
				target.begin(2, 2);
				target.openNode(0);
				target.static('<span>');
				target.text(0, 'value');
				target.static('</span>');
				target.closeNode(0);
			}
		}),
		[
			() => {
				reads++;
				return createCompiledVNode('em', null, 'unsupported text');
			},
			() => {
				throw new Error('preflight continued after selecting the fallback');
			}
		],
		() => createCompiledVNode('span', null, 'fallback')
	);

	expect(renderToString(program, { markers: false }).html).toBe('<span>fallback</span>');
	expect(reads).toBe(1);
});

it('serializes planned host slots with ordinary SSR attribute semantics', () => {
	const program = createCompiledRenderProgram(
		'render-program:ssr-props',
		() => ({
			version: 3,
			id: 'render-program:ssr-props',
			namespace: 'html',
			ssr(target) {
				target.prepareAttribute(0);
				target.prepareAttribute(1);
				target.prepareAttribute(2);
				target.begin(1, 3);
				target.static('<button data-exact-id="planned"');
				target.attribute(0, 'className', 'button');
				target.attribute(1, 'disabled', 'button');
				target.attribute(2, 'onClick', 'button');
				target.static('>Save</button>');
			}
		}),
		[() => ['primary', { active: true }], () => true, () => () => undefined],
		() => createCompiledVNode('button', { className: 'primary active', disabled: true }, 'Save')
	);
	expect(renderToString(program, { markers: false }).html).toBe(
		'<button data-exact-id="planned" class="primary active" disabled>Save</button>'
	);
});

it('executes structural program slots without colliding with nested marker identities', () => {
	function Child() {
		return () => createVNode('strong', null, 'child');
	}
	const program = createCompiledRenderProgram(
		'render-program:ssr-structural',
		() => ({
			version: 3,
			id: 'render-program:ssr-structural',
			namespace: 'html',
			ssr(target) {
				target.prepareChild(0);
				target.begin(1, 1);
				target.openNode(0);
				target.static('<section>');
				target.child(0, 'child');
				target.static('</section>');
				target.closeNode(0);
			}
		}),
		[() => createVNode(Child, {})],
		() =>
			createCompiledVNode(
				'section',
				null,
				createDynamicChild(() => createVNode(Child, {}), 'child')
			)
	);

	const marked = renderToString(program).html;
	expect(marked).toContain('<!--exact:cell:0--><section><!--exact:dynamic:child-->');
	expect(marked).toContain('<!--exact:component:1:');
	expect(marked).not.toContain('<!--exact:component:0:');
	expect(marked).toContain('<strong>child</strong><!--/exact:component:1:');
	expect(marked).toContain('<!--/exact:dynamic:child--></section><!--/exact:cell:0-->');
	expect(renderToString(program, { markers: false }).html).toBe(
		'<section><strong>child</strong></section>'
	);
});

it('materializes marker-mode program fallbacks inside their component scope', async () => {
	let fallbackScope: EffectScope | undefined;
	function ProgramOwner() {
		return () =>
			createCompiledRenderProgram(
				'render-program:ssr-owned-fallback',
				() => ({
					version: 3,
					id: 'render-program:ssr-owned-fallback',
					namespace: 'html',
					template: '<span>owned</span>',
					parts: ['<span>owned</span>'],
					slots: [],
					bindings: [],
					nodes: [['owned', 'span']]
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
