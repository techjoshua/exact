import {
	activateTaskForHost,
	defineTask,
	markIndependentAsyncSiblings,
	type Component,
	type TaskContext
} from '@exactjs/core';
import {
	createCompiledVNode,
	createDynamicChild,
	createServerSlot,
	keyCompiledVNode,
	prepareCompiledRenderProgram
} from '@exactjs/core/runtime/render';
import { createPreparedServerRenderProgram } from '@exactjs/core/framework/server-render-structure';
import { createExactFrameworkFixtureArtifact } from '@exactjs/core/framework/runtime-component-artifacts';
import { createEffectScope, type EffectScope } from '@exactjs/reactive';
import { expect, it, vi } from 'vitest';
import { renderToStream, renderToString, renderToStringAsync } from './index.js';
import { createVNode } from './test-support/native-vnode.js';
import { readStreamText } from './test-support/streams.js';

const createCompiledRenderProgram = (
	_cacheKey: string,
	createProgram: () => Parameters<typeof prepareCompiledRenderProgram>[0],
	readers: readonly (() => unknown)[] | ((index: number) => unknown),
	fallback?: Parameters<typeof createPreparedServerRenderProgram>[2]
) =>
	createPreparedServerRenderProgram(
		prepareCompiledRenderProgram(createProgram()),
		Array.isArray(readers) ? readers.map((reader) => reader()) : [],
		fallback
	);

const programRoot = (program: ReturnType<typeof createCompiledRenderProgram>) => {
	const Root = createExactFrameworkFixtureArtifact(function ProgramRoot(
		this: Component<Record<string, never>>
	) {
		return () => program as never;
	}, 'fixture:ssr-render-program-root');
	return createVNode(Root, {});
};

it('writes compiler-owned scalar programs without redundant hydration delimiters', () => {
	let constructions = 0;
	const program = createCompiledRenderProgram(
		'render-program:ssr',
		() => {
			constructions++;
			return {
				version: 4,
				id: 'render-program:ssr',
				namespace: 'html',
				ssr(target, context, invocation) {
					const value = target.prepareText(invocation, 0);
					if (value === target.unprepared) return;
					target.begin(context, 1, 1, 0);
					const output: Array<string | readonly unknown[]> = [];
					target.static(output, '<span data-exact-id="planned">');
					target.text(context, output, value, 'value', 0, true);
					target.static(output, '</span>');
					return output;
				}
			};
		},
		[() => '<safe>'],
		() => {
			throw new Error('valid generated SSR lane used its generic fallback');
		}
	);
	expect(renderToString(programRoot(program), { markers: false }).html).toBe(
		'<span data-exact-id="planned">&lt;safe&gt;</span>'
	);
	expect(renderToString(programRoot(program)).html).toContain(
		'<span data-exact-id="planned">&lt;safe&gt;</span>'
	);
	expect(constructions).toBe(1);
});

it('captures every generated server slot before selecting the local fallback', () => {
	let reads = 0;
	const program = createCompiledRenderProgram(
		'render-program:ssr-preflight',
		() => ({
			version: 4,
			id: 'render-program:ssr-preflight',
			namespace: 'html',
			ssr(target, context, invocation) {
				const value = target.prepareText(invocation, 0);
				if (value === target.unprepared) return;
				const second = target.prepareText(invocation, 1);
				if (second === target.unprepared) return;
				target.begin(context, 2, 2, 0);
				const output: Array<string | readonly unknown[]> = [];
				target.static(output, '<span>');
				target.text(context, output, value, 'value', 0);
				target.static(output, '</span>');
				return output;
			}
		}),
		[
			() => {
				reads++;
				return createCompiledVNode('em', null, 'unsupported text');
			},
			() => {
				reads++;
				return 'second';
			}
		],
		() => createCompiledVNode('span', null, 'fallback')
	);

	expect(renderToString(programRoot(program), { markers: false }).html).toBe(
		'<span>fallback</span>'
	);
	expect(reads).toBe(2);
});

it('serializes planned host slots with ordinary SSR attribute semantics', () => {
	const program = createCompiledRenderProgram(
		'render-program:ssr-props',
		() => ({
			version: 4,
			id: 'render-program:ssr-props',
			namespace: 'html',
			ssr(target, context, invocation) {
				const className = target.prepareAttribute(invocation, 0);
				if (className === target.unprepared) return;
				const disabled = target.prepareAttribute(invocation, 1);
				if (disabled === target.unprepared) return;
				const onClick = target.prepareAttribute(invocation, 2);
				if (onClick === target.unprepared) return;
				target.begin(context, 1, 3, 0);
				const output: Array<string | readonly unknown[]> = [];
				target.static(output, '<button data-exact-id="planned"');
				target.attribute(context, output, className, 'className', 'button', 0);
				target.attribute(context, output, disabled, 'disabled', 'button', 0);
				target.attribute(context, output, onClick, 'onClick', 'button', 0);
				target.static(output, '>Save</button>');
				return output;
			}
		}),
		[() => ['primary', { active: true }], () => true, () => () => undefined],
		() => createCompiledVNode('button', { className: 'primary active', disabled: true }, 'Save')
	);
	expect(renderToString(programRoot(program), { markers: false }).html).toBe(
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
			version: 4,
			id: 'render-program:ssr-structural',
			namespace: 'html',
			ssr(target, context, invocation) {
				const child = target.prepareChild(invocation, 0);
				if (child === target.unprepared) return;
				target.begin(context, 1, 1, 0);
				const output: Array<string | readonly unknown[]> = [];
				target.static(output, '<section>');
				target.child(context, output, child, 'child', 0);
				target.static(output, '</section>');
				return output;
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

	const marked = renderToString(programRoot(program)).html;
	expect(marked).toContain('<section><!--exact:dynamic:child-->');
	expect(marked).toContain('<!--exact:component:2:');
	expect(marked).toContain('<strong>child</strong><!--/exact:component:2:');
	expect(marked).toContain('<!--/exact:dynamic:child--></section>');
	expect(marked).not.toContain('<!--exact:cell:');
	expect(renderToString(programRoot(program), { markers: false }).html).toBe(
		'<section><strong>child</strong></section>'
	);
	expect((await renderToStringAsync(programRoot(program), { markers: false })).html).toBe(
		'<section><strong>child</strong></section>'
	);
	expect(await readStreamText(renderToStream(programRoot(program), { markers: false }))).toBe(
		'<section><strong>child</strong></section>'
	);
});

it('uses the compiler-owned component slot as the component hydration boundary', async () => {
	function Child() {
		return () => createVNode('strong', null, 'child');
	}
	const program = createCompiledRenderProgram(
		'render-program:ssr-component',
		() => ({
			version: 4,
			id: 'render-program:ssr-component',
			namespace: 'html',
			ssr(target, context, invocation) {
				const child = target.prepareComponent(invocation, 0);
				if (child === target.unprepared) return;
				target.begin(context, 1, 1, 0);
				const output = target.output();
				target.static(output, '<section>');
				target.component(context, output, child, 'child', 0);
				target.static(output, '</section>');
				return output;
			}
		}),
		[() => createVNode(Child, {})]
	);

	const html = renderToString(programRoot(program)).html;
	expect(html).toContain(
		'<section><!--exact:dynamic:child--><strong>child</strong><!--/exact:dynamic:child--></section>'
	);
	expect(html.match(/exact:component:/g)).toHaveLength(2);
});

it('writes a compiler-proven final keyed child without structural delimiters', async () => {
	const program = createCompiledRenderProgram(
		'render-program:ssr-keyed-tail',
		() => ({
			version: 4,
			id: 'render-program:ssr-keyed-tail',
			namespace: 'html',
			ssr(target, context, invocation) {
				const child = target.prepareChild(invocation, 0);
				if (child === target.unprepared) return;
				target.begin(context, 1, 1, 0);
				const output: Array<string | readonly unknown[]> = [];
				target.static(output, '<ul>');
				target.keyedChild(output, child);
				target.static(output, '</ul>');
				return output;
			}
		}),
		[
			() => [
				keyCompiledVNode(createCompiledVNode('li', null, 'a'), 'a'),
				keyCompiledVNode(createCompiledVNode('li', null, 'b'), 'b')
			]
		]
	);

	const root = programRoot(program);
	const html = renderToString(root).html;
	expect(html).toContain('<li>a</li>');
	expect(html).toContain('<li>b</li>');
	expect(html).not.toContain('exact:dynamic:');
	expect((await renderToStringAsync(root)).html).toBe(html);
	expect(await readStreamText(renderToStream(root))).toBe(html);
});

it('executes nested prepared server programs without stringifying their invocation', async () => {
	const inner = createCompiledRenderProgram(
		'nested:inner',
		() => ({
			version: 4,
			id: 'nested:inner',
			namespace: 'html',
			ssr(target, context) {
				target.begin(context, 1, 0, 23);
				const output = target.output();
				target.static(output, '<strong>nested</strong>');
				return output;
			}
		}),
		[]
	);
	const outer = createCompiledRenderProgram(
		'nested:outer',
		() => ({
			version: 4,
			id: 'nested:outer',
			namespace: 'html',
			ssr(target, context, invocation) {
				const value = target.prepareChild(invocation, 0);
				if (value === target.unprepared) return;
				target.begin(context, 1, 1, 11);
				const output = target.output();
				target.static(output, '<section>');
				target.keyedChild(output, value);
				target.static(output, '</section>');
				return output;
			}
		}),
		[() => [inner]]
	);
	const root = programRoot(outer);
	const expected = '<section><strong>nested</strong></section>';

	expect(renderToString(root, { markers: false }).html).toBe(expected);
	expect((await renderToStringAsync(root, { markers: false })).html).toBe(expected);
	expect(await readStreamText(renderToStream(root, { markers: false }))).toBe(expected);
});

it('materializes marker-mode program fallbacks inside their component scope', async () => {
	let fallbackScope: EffectScope | undefined;
	const program = prepareCompiledRenderProgram({
		version: 4,
		id: 'render-program:ssr-owned-fallback',
		namespace: 'html',
		template: '<span>owned</span>',
		slots: [],
		bindings: [],
		nodes: [[0, 'span']]
	});
	function ProgramOwner() {
		return () =>
			createPreparedServerRenderProgram(program, [], () => {
				fallbackScope = createEffectScope();
				return createCompiledVNode('span', null, 'owned');
			});
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
