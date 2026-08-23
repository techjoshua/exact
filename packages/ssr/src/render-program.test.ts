import {
	activateTaskForHost,
	defineTask,
	markIndependentAsyncSiblings,
	type Component,
	type TaskContext
} from '@exactjs/core';
import {
	createDynamicChild,
	createCompiledVNode,
	createServerSlot,
	keyCompiledVNode
} from '@exactjs/core/runtime/render';
import { createCompiledRenderProgram } from '@exactjs/core/runtime/render';
import { createEffectScope, type EffectScope } from '@exactjs/reactive';
import { expect, it, vi } from 'vitest';
import { renderToStream, renderToString, renderToStringAsync } from './index.js';
import { createVNode } from './test-support/native-vnode.js';
import { readStreamText } from './test-support/streams.js';

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
				target.static('<span>');
				target.text(0, 'value');
				target.static('</span>');
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

it('executes structural program slots without colliding with nested marker identities', async () => {
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
				target.static('<section>');
				target.child(0, 'child');
				target.static('</section>');
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
	expect(marked).toContain('<section><!--exact:dynamic:child-->');
	expect(marked).toContain('<!--exact:component:1:');
	expect(marked).toContain('<strong>child</strong><!--/exact:component:1:');
	expect(marked).toContain('<!--/exact:dynamic:child--></section>');
	expect(marked).not.toContain('<!--exact:cell:');
	expect(renderToString(program, { markers: false }).html).toBe(
		'<section><strong>child</strong></section>'
	);
	expect((await renderToStringAsync(program, { markers: false })).html).toBe(
		'<section><strong>child</strong></section>'
	);
	expect(await readStreamText(renderToStream(program, { markers: false }))).toBe(
		'<section><strong>child</strong></section>'
	);
});

it('writes a compiler-proven final keyed child without structural delimiters', async () => {
	const program = createCompiledRenderProgram(
		'render-program:ssr-keyed-tail',
		() => ({
			version: 3,
			id: 'render-program:ssr-keyed-tail',
			namespace: 'html',
			ssr(target) {
				target.prepareChild(0);
				target.begin(1, 1);
				target.static('<ul>');
				target.keyedChild(0);
				target.static('</ul>');
			}
		}),
		[
			() => [
				keyCompiledVNode(createCompiledVNode('li', null, 'a'), 'a'),
				keyCompiledVNode(createCompiledVNode('li', null, 'b'), 'b')
			]
		]
	);

	const html = renderToString(program).html;
	expect(html).toContain('<li>a</li>');
	expect(html).toContain('<li>b</li>');
	expect(html).not.toContain('exact:dynamic:');
	expect((await renderToStringAsync(program)).html).toBe(html);
	expect(await readStreamText(renderToStream(program))).toBe(html);
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

it('preserves proven concurrency through directly wired server slots', async () => {
	const releases: Array<() => void> = [];
	let started = 0;
	function Wait(this: Component<{}>, props: { label: string }) {
		activateTaskForHost(
			this,
			defineTask({}, async () => {
				started++;
				await new Promise<void>((resolve) => releases.push(resolve));
			})
		);
		return () => createVNode('span', null, props.label);
	}
	const child = (label: string) => {
		const id = `slot:${label}`;
		return createServerSlot(
			id,
			{
				planVersion: 1,
				buildKey: 'test-build',
				planEdgeId: id,
				ownerComponentId: 'test-owner',
				discriminator: { kind: 'single' },
				generation: 1
			},
			createVNode(Wait, { label })
		);
	};
	const group = markIndependentAsyncSiblings(
		createCompiledVNode('div', null, child('a'), child('b'))
	);
	const rendering = renderToStringAsync(group, { markers: false, maxAsyncSsrConcurrency: 2 });
	await vi.waitFor(() => expect(started).toBe(2));
	releases.splice(0).forEach((release) => release());
	const rendered = await rendering;
	expect(rendered.html).toMatch(
		/^<div><span data-exact-server-slot="slot:a"[^>]*><span>a<\/span><\/span><span data-exact-server-slot="slot:b"[^>]*><span>b<\/span><\/span><\/div>$/
	);
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
