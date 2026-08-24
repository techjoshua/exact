/**
 * @vitest-environment jsdom
 */
import './framework/enhancements.js';
import '@exactjs/core/runtime/refs';
import {
	createContext,
	createEnhancementMarker,
	Fragment,
	markExactEnhancementContexts,
	Target,
	TargetOverrides,
	type Child,
	type Component,
	type RootLifecycle
} from '@exactjs/core';
import {
	createCompiledTarget,
	createDynamicChild,
	createExpression,
	createPreparedRenderProgram,
	prepareCompiledRenderProgram,
	type ExactRenderProgramBindingTarget
} from '@exactjs/core/runtime/render';
import { markTestComponent } from '@exactjs/testing/internal/fixtures';
import { computed, flushSync, reactive } from '@exactjs/reactive';
import { indexedReactiveObjects } from '@exactjs/reactive/framework/indexed-objects';
import { createEffectScope } from '@exactjs/reactive/framework/runtime';
import { describe, expect, it, vi } from 'vitest';
import { render } from './index.js';
import { inspectDomRoot } from './testing.js';
import { createVNode } from './test-support/native-vnode.js';
import {
	applyCompiledProgramText,
	beginCompiledProgramClaims,
	bindCompiledComponentUpdate,
	bindCompiledProgramText,
	claimCompiledProgramText
} from './runtime/render-program.js';

const identity = '@test/motion#motion';

describe('renderer enhancements', () => {
	it('activates a transparent enhancement as an ordinary component around its intrinsic target', () => {
		const setup = vi.fn();
		let target!: RootLifecycle<HTMLElement>;
		const Motion = markTestComponent(function Motion(
			this: Component<{}>,
			props: { children?: Child }
		) {
			setup();
			target = this.refs.root<HTMLElement>();
			return () => props.children;
		});
		const button = createVNode('button', {
			id: 'save',
			__exactEnhancements: createEnhancementMarker([{ identity, props: { preset: 'fade' } }])
		});
		const container = document.createElement('div');

		render(button, container, { enhancementCatalog: new Map([[identity, Motion]]) });

		expect(container.innerHTML).toBe('<button id="save"></button>');
		expect(setup).toHaveBeenCalledTimes(1);
		expect(target.current).toBe(container.firstElementChild);
		expect(target.presented).toBe(true);
	});

	it('allows an active enhancement component to wrap its target', () => {
		const released = vi.fn();
		const Wrapper = markTestComponent(function Wrapper(
			this: Component<{}>,
			props: { children?: Child; className?: string }
		) {
			this.onUnmount(released);
			return () => createVNode('div', { className: props.className }, props.children);
		});
		const container = document.createElement('div');
		const marker = createEnhancementMarker([{ identity, props: { className: 'motion-shell' } }]);

		render(createVNode('button', { __exactEnhancements: marker }, 'Save'), container, {
			enhancementCatalog: new Map([[identity, Wrapper]])
		});

		expect(container.innerHTML).toBe('<div class="motion-shell"><button>Save</button></div>');

		const updated = createEnhancementMarker([
			{ identity, props: { className: 'motion-shell updated' } }
		]);
		render(createVNode('button', { __exactEnhancements: updated }, 'Saved'), container, {
			enhancementCatalog: new Map([[identity, Wrapper]])
		});
		expect(container.innerHTML).toBe(
			'<div class="motion-shell updated"><button>Saved</button></div>'
		);
		const target = container.querySelector('button');

		render(createVNode('button', null, 'Plain'), container, {
			enhancementCatalog: new Map([[identity, Wrapper]])
		});
		expect(container.innerHTML).toBe('<button>Plain</button>');
		expect(container.firstElementChild).toBe(target);
		expect(released).toHaveBeenCalledOnce();
	});

	it('preserves compiler-owned form bindings through target contributions', () => {
		const publish = vi.fn();
		const Field = markTestComponent(function Field(
			this: Component<{}>,
			props: { children?: Child }
		) {
			return () => createCompiledTarget({ className: 'field' }, props.children);
		});
		const container = document.createElement('div');

		render(
			createVNode('select', {
				__exactBindChange: publish,
				__exactEnhancements: createEnhancementMarker([{ identity, props: {} }])
			}),
			container,
			{ enhancementCatalog: new Map([[identity, Field]]) }
		);
		container.querySelector('select')!.dispatchEvent(new Event('change', { bubbles: true }));

		expect(publish).toHaveBeenCalledOnce();
		expect(container.querySelector('select')?.className).toBe('field');
	});

	it('preserves compiler-specialized interaction handlers through target contributions', () => {
		const publish = vi.fn();
		const Action = markTestComponent(function Action(
			this: Component<{}>,
			props: { children?: Child }
		) {
			return () => createCompiledTarget({ className: 'action' }, props.children);
		});
		const container = document.createElement('div');

		render(
			createVNode(
				'button',
				{
					'__exactClosedInteraction:onClick': publish,
					__exactEnhancements: createEnhancementMarker([{ identity, props: {} }])
				},
				'Save'
			),
			container,
			{ enhancementCatalog: new Map([[identity, Action]]) }
		);
		container.querySelector('button')!.click();

		expect(publish).toHaveBeenCalledOnce();
		expect(container.querySelector('button')?.className).toBe('action');
	});

	it('composes an enhancement directly around an underscore fragment boundary', () => {
		const Wrapper = markTestComponent(function Wrapper(
			this: Component<{}>,
			props: { children?: Child }
		) {
			return () => createVNode('aside', null, props.children);
		});
		const container = document.createElement('div');

		render(
			createVNode(
				Fragment,
				{ __exactEnhancements: createEnhancementMarker([{ identity, props: {} }]) },
				'Before',
				createVNode('strong', null, 'After')
			),
			container,
			{ enhancementCatalog: new Map([[identity, Wrapper]]) }
		);

		expect(container.innerHTML).toBe('<aside>Before<strong>After</strong></aside>');
	});

	it('constructs direct target descendants beneath enhancement-provided context', () => {
		const token = createContext<{ readonly value: string }>('@test/direct-enhancement-provider');
		const consumerSetups = vi.fn();
		const Provider = markTestComponent(function Provider(
			this: Component<{}>,
			props: { children?: Child; value?: string }
		) {
			this.setContext(token, {
				get value() {
					return props.value ?? 'missing';
				}
			});
			return () => createVNode('section', null, props.children);
		});
		markExactEnhancementContexts(Provider, { provides: [token] });
		const Consumer = markTestComponent(function Consumer(this: Component<{}>) {
			consumerSetups();
			const value = this.getContext(token);
			return () => createVNode('output', null, value.value);
		});
		const marker = createEnhancementMarker([{ identity, props: { value: 'ready' } }]);
		const container = document.createElement('div');

		render(
			createVNode(
				Fragment,
				{ __exactEnhancements: marker },
				createVNode('div', null, createVNode(Consumer, null))
			),
			container,
			{ enhancementCatalog: new Map([[identity, Provider]]) }
		);

		expect(container.innerHTML).toBe('<section><div><output>ready</output></div></section>');

		render(
			createVNode(
				Fragment,
				{
					__exactEnhancements: createEnhancementMarker([{ identity, props: { value: 'updated' } }])
				},
				createVNode('div', null, createVNode(Consumer, null))
			),
			container,
			{ enhancementCatalog: new Map([[identity, Provider]]) }
		);

		expect(container.innerHTML).toBe('<section><div><output>updated</output></div></section>');
		expect(consumerSetups).toHaveBeenCalledOnce();
	});

	it('keeps compiled updates owned by the authored component through a direct enhancement', () => {
		const token = createContext<string>('@test/compiled-update-enhancement-owner');
		const Provider = markTestComponent(function Provider(
			this: Component<{}>,
			props: { children?: Child }
		) {
			this.setContext(token, 'provided');
			return () => createCompiledTarget({ className: 'provided' }, props.children);
		});
		markExactEnhancementContexts(Provider, { provides: [token] });
		const updates = {
			bindings: [['count', 1, 0]] as const,
			apply(targets: readonly (object | undefined)[], dirtyLow: number) {
				if ((dirtyLow & 1) !== 0 && targets[0])
					applyCompiledProgramText(targets[0] as ExactRenderProgramBindingTarget, 0);
			}
		};
		const program = prepareCompiledRenderProgram({
			version: 4,
			id: '@test/compiled-update-enhancement-owner',
			namespace: 'html',
			template: '<output><!---->\ue000exact:0\ue001<!----></output>',
			directClaims: true,
			bind(target) {
				if (beginCompiledProgramClaims(target, 'output', 'html', 1, 1)) {
					claimCompiledProgramText(target, 0, 0, true);
					return;
				}
				bindCompiledProgramText(target, 0, true);
				bindCompiledComponentUpdate(target, 0, updates);
			}
		});
		const ownerScope = createEffectScope();
		const state = indexedReactiveObjects<{ count: number }>(['count']);
		state.count = 0;
		const owner = { state, scope: ownerScope };
		const container = document.createElement('div');

		render(
			createVNode(
				'section',
				{
					__exactEnhancements: createEnhancementMarker([{ identity, props: {} }])
				},
				createPreparedRenderProgram(program, [() => state.count], owner)
			),
			container,
			{ enhancementCatalog: new Map([[identity, Provider]]) }
		);
		expect(container.innerHTML).toBe('<section class="provided"><output>0</output></section>');

		state.count = 1;
		flushSync();
		expect(container.querySelector('output')?.textContent).toBe('1');
		ownerScope.stop();
	});

	it('nests direct enhancement providers through fragment and intrinsic targets', () => {
		const token = createContext<string>('@test/nested-direct-enhancement-provider');
		const Provider = markTestComponent(function Provider(
			this: Component<{}>,
			props: { children?: Child; value?: string }
		) {
			const parent = this.hasContext(token) ? this.getContext(token) : undefined;
			this.setContext(token, `${parent ? `${parent}/` : ''}${props.value}`);
			return () => createVNode('div', null, props.children);
		});
		markExactEnhancementContexts(Provider, {
			provides: [token],
			optionallyConsumes: [token]
		});
		const Consumer = markTestComponent(function Consumer(this: Component<{}>) {
			const value = this.getContext(token);
			return () => createVNode('output', null, value);
		});
		const enhanced = (value: string, child: Child) =>
			createVNode(
				Fragment,
				{
					__exactEnhancements: createEnhancementMarker([{ identity, props: { value } }])
				},
				child
			);
		const container = document.createElement('div');

		render(
			enhanced('outer', createVNode('main', null, enhanced('inner', createVNode(Consumer, null)))),
			container,
			{ enhancementCatalog: new Map([[identity, Provider]]) }
		);

		expect(container.querySelector('output')?.textContent).toBe('outer/inner');
	});

	it('tracks reactive props owned outside a nested direct provider chain', () => {
		const token = createContext<{ readonly value: string }>(
			'@test/reactive-nested-direct-provider'
		);
		const Provider = markTestComponent(function Provider(
			this: Component<{}>,
			props: { children?: Child; value?: string }
		) {
			this.setContext(token, {
				get value() {
					return props.value ?? 'missing';
				}
			});
			return () => createVNode('div', null, props.children);
		});
		markExactEnhancementContexts(Provider, { provides: [token] });
		const Consumer = markTestComponent(function Consumer(this: Component<{}>) {
			const value = this.getContext(token);
			return () => createVNode('output', null, value.value);
		});
		let owner!: Component<{ outer: string; inner: string }>;
		const enhanced = (value: unknown, child: Child) =>
			createVNode(
				Fragment,
				{
					__exactEnhancements: createEnhancementMarker([{ identity, props: { value } }])
				},
				child
			);
		const App = markTestComponent(function App(this: Component<{ outer: string; inner: string }>) {
			owner = this;
			this.state.outer = 'outer';
			this.state.inner = 'inner';
			return () =>
				enhanced(
					createExpression(() => this.state.outer),
					enhanced(
						createExpression(() => this.state.inner),
						createVNode(Consumer, null)
					)
				);
		});
		const container = document.createElement('div');
		render(createVNode(App, null), container, {
			enhancementCatalog: new Map([[identity, Provider]])
		});

		owner.state.inner = 'updated';
		flushSync();

		expect(container.querySelector('output')?.textContent).toBe('updated');
	});

	it('forwards layered target properties through ordinary component composition', () => {
		const calls: string[] = [];
		const refs = (name: string) => ({
			fulfill(value: unknown) {
				if (value instanceof Element) calls.push(`ref:${name}`);
			}
		});
		const Inner = markTestComponent(function Inner(
			this: Component<{}>,
			props: { children?: Child }
		) {
			return () =>
				createVNode(
					Target,
					{
						title: 'inner',
						className: 'inner shared',
						style: { color: 'blue', paddingTop: '4px' },
						'aria-describedby': 'inner shared',
						ref: refs('inner'),
						onClick: () => calls.push('inner')
					},
					props.children
				);
		});
		const Outer = markTestComponent(function Outer(
			this: Component<{}>,
			props: { children?: Child }
		) {
			return () =>
				createVNode(
					'section',
					null,
					createVNode(
						Target,
						{
							title: 'outer',
							className: 'outer shared',
							style: { color: 'red', marginTop: '2px' },
							'aria-describedby': 'outer shared',
							ref: refs('outer'),
							onClick: () => calls.push('outer')
						},
						createVNode(Inner, null, props.children)
					)
				);
		});
		const container = document.createElement('div');
		render(
			createVNode(
				Outer,
				null,
				createVNode(
					'button',
					{
						title: 'authored',
						className: 'authored shared',
						style: { color: 'green' },
						'aria-describedby': 'authored shared',
						ref: refs('authored'),
						onClick: () => calls.push('authored')
					},
					'Save'
				)
			),
			container
		);

		const button = container.querySelector('button')!;
		expect(button.title).toBe('authored');
		expect(button.className).toBe('authored shared inner outer');
		expect(button.getAttribute('style')).toContain('color: green');
		expect(button.getAttribute('style')).toContain('padding-top: 4px');
		expect(button.getAttribute('style')).toContain('margin-top: 2px');
		expect(button.getAttribute('aria-describedby')).toBe('authored shared inner outer');
		expect(new Set(calls)).toEqual(new Set(['ref:authored', 'ref:inner', 'ref:outer']));
		calls.length = 0;
		button.click();
		expect(calls).toEqual(['authored', 'inner', 'outer']);
		expect(container.querySelector('section')).not.toBeNull();
	});

	it('keeps target event subscriptions independent and honors immediate propagation stops', () => {
		const calls: string[] = [];
		const container = document.createElement('div');
		render(
			createVNode(
				Target,
				{ onClick: () => calls.push('outer') },
				createVNode(
					Target,
					{ onClick: () => calls.push('inner') },
					createVNode(
						'button',
						{
							onClick: (event: Event) => {
								calls.push('authored');
								event.stopImmediatePropagation();
							}
						},
						'Save'
					)
				)
			),
			container
		);

		container.querySelector('button')!.click();
		expect(calls).toEqual(['authored']);
	});

	it('allows framework projections to replace only declared authored fallbacks', () => {
		const container = document.createElement('div');
		render(
			createVNode(
				Target,
				{ title: 'Translated', [TargetOverrides]: ['title'] },
				createVNode('button', { title: 'Fallback', id: 'stable' }, 'Save')
			),
			container
		);

		expect(container.innerHTML).toBe('<button title="Translated" id="stable">Save</button>');
	});

	it('does not reroute target ownership for unrelated structural changes', () => {
		const state = reactive({ sibling: false });
		const refCalls: unknown[] = [];
		const target = {
			fulfill(value: unknown) {
				refCalls.push(value);
			}
		};
		const container = document.createElement('div');
		render(
			createVNode(
				Fragment,
				null,
				createVNode(Target, { ref: target }, createVNode('button', null, 'Stable')),
				createDynamicChild(() =>
					state.sibling
						? createVNode('aside', null, 'Changed')
						: createVNode('span', null, 'Initial')
				)
			),
			container
		);

		expect(refCalls).toHaveLength(1);
		state.sibling = true;
		flushSync();
		expect(refCalls).toHaveLength(1);
		expect(container.querySelector('button')?.textContent).toBe('Stable');
	});

	it('exposes target owners, live contribution values, and effective props to inspection', () => {
		const state = reactive({ title: 'contributed' });
		const container = document.createElement('div');
		render(
			createVNode(
				Target,
				{ title: computed(() => state.title), className: 'layer' },
				createVNode('button', { className: 'authored' }, 'Inspect')
			),
			container
		);

		state.title = 'updated';
		flushSync();
		const root = inspectDomRoot(container)!;
		const boundary = root.children[0]!;
		const intrinsic = boundary.children[0]!;
		expect(boundary.target?.selected).toBe(container.querySelector('button'));
		expect(intrinsic.target?.contributions[0]?.props.title).toBe('updated');
		expect(intrinsic.target?.effectiveProps?.className).toBe('authored layer');
	});

	it('uses the same target forwarding when an ordinary component is enhancement-invoked', () => {
		let root!: RootLifecycle<HTMLElement>;
		const Surface = markTestComponent(function Surface(
			this: Component<{}>,
			props: { children?: Child; tone?: string }
		) {
			root = this.refs.root<HTMLElement>();
			return () =>
				createVNode(
					'label',
					{ className: 'surface' },
					createVNode(
						Target,
						{ className: props.tone, 'aria-describedby': 'surface-help' },
						props.children
					),
					createVNode('small', { id: 'surface-help' }, 'Help')
				);
		});
		const container = document.createElement('div');

		render(
			createVNode('input', {
				className: 'authored',
				__exactEnhancements: createEnhancementMarker([{ identity, props: { tone: 'enhanced' } }])
			}),
			container,
			{ enhancementCatalog: new Map([[identity, Surface]]) }
		);

		const input = container.querySelector('input')!;
		expect(container.innerHTML).toBe(
			'<label class="surface"><input class="authored enhanced" aria-describedby="surface-help"><small id="surface-help">Help</small></label>'
		);
		expect(root.current).toBe(input);
	});

	it('keeps dormant target contributions and attaches them after structural output appears', () => {
		const state = reactive({ visible: false, tone: 'quiet' });
		const container = document.createElement('div');
		render(
			createVNode(
				Target,
				{ className: computed(() => state.tone) },
				createDynamicChild(() =>
					state.visible ? createVNode('button', { id: 'target' }, 'Ready') : 'Waiting'
				)
			),
			container
		);

		expect(container.textContent).toBe('Waiting');
		state.visible = true;
		flushSync();
		expect(container.querySelector('button')?.className).toBe('quiet');
		state.tone = 'active';
		flushSync();
		expect(container.querySelector('button')?.className).toBe('active');
	});

	it('releases and reattaches one target owner across conditional target generations', () => {
		const state = reactive({ mode: 'button' as 'button' | 'text' | 'link' });
		const refs: unknown[] = [];
		const target = {
			fulfill(value: unknown) {
				refs.push(value);
			}
		};
		const container = document.createElement('div');
		render(
			createVNode(
				Target,
				{ ref: target, title: 'owned' },
				createDynamicChild(() =>
					state.mode === 'button'
						? createVNode('button', null, 'Button')
						: state.mode === 'link'
							? createVNode('a', { href: '#' }, 'Link')
							: 'No target'
				)
			),
			container
		);

		expect(refs.at(-1)).toBe(container.querySelector('button'));
		state.mode = 'text';
		flushSync();
		expect(refs.at(-1)).toBeUndefined();
		expect(container.textContent).toBe('No target');
		state.mode = 'link';
		flushSync();
		expect(refs.at(-1)).toBe(container.querySelector('a'));
		expect(container.querySelector('a')?.title).toBe('owned');
	});

	it('propagates a nested target generation change to outer target owners', () => {
		const state = reactive({ link: false });
		const outerRefs: unknown[] = [];
		const container = document.createElement('div');
		render(
			createVNode(
				Target,
				{
					className: 'outer',
					ref: { fulfill: (value: unknown) => outerRefs.push(value) }
				},
				createVNode(
					Target,
					{ className: 'inner' },
					createDynamicChild(() =>
						state.link
							? createVNode('a', { href: '#' }, 'Link')
							: createVNode('button', null, 'Button')
					)
				)
			),
			container
		);

		expect(container.querySelector('button')?.className).toBe('inner outer');
		state.link = true;
		flushSync();
		expect(container.querySelector('a')?.className).toBe('inner outer');
		expect(outerRefs.at(-1)).toBe(container.querySelector('a'));
	});

	it('keeps the first direct intrinsic authoritative through transparent conditional output', () => {
		const state = reactive({ direct: true });
		const container = document.createElement('div');
		render(
			createVNode(
				Target,
				{ className: 'outer' },
				createDynamicChild(() =>
					createVNode(
						Fragment,
						null,
						state.direct ? createVNode('section', { id: 'host' }, 'Host') : 'No host',
						createVNode(Target, { className: 'inner' }, createVNode('h2', null, 'Heading'))
					)
				)
			),
			container
		);

		expect(container.querySelector('#host')?.className).toBe('outer');
		expect(container.querySelector('h2')?.className).toBe('inner');

		state.direct = false;
		flushSync();

		expect(container.querySelector('#host')).toBeNull();
		expect(container.querySelector('h2')?.className).toBe('inner outer');
	});
});
import './runtime/target.js';
import '@exactjs/core/runtime/contexts';
