/**
 * @vitest-environment jsdom
 */
import {
	createContext,
	createDynamicChild,
	createEnhancementMarker,
	createPortal,
	Fragment,
	Target,
	markExactEnhancementContexts,
	type Child,
	type Component,
	type LogEvent,
	type Logger,
	type RootLifecycle
} from '@exactjs/core';
import { markTestComponent } from '@exactjs/testing/internal/fixtures';
import { computed, flushSync, reactive } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { render } from './index.js';
import { inspectDomRoot } from './testing.js';
import { createVNode } from './test-support/native-vnode.js';

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

	it('forwards declarations through components and merges nearest props at an explicit target', () => {
		const setup = vi.fn();
		const Motion = markTestComponent(function Motion(
			this: Component<{}>,
			props: { children?: Child; tone?: string }
		) {
			setup(props.tone);
			return () => createVNode('div', { className: props.tone }, props.children);
		});
		const Card = markTestComponent(function Card(this: Component<{}>) {
			return () =>
				createVNode(
					'section',
					null,
					createVNode(
						'button',
						{
							__exactEnhancements: createEnhancementMarker([
								{ identity, props: { tone: 'near' }, root: true }
							])
						},
						'Save'
					)
				);
		});
		const container = document.createElement('div');

		render(
			createVNode(Card, {
				__exactEnhancements: createEnhancementMarker([{ identity, props: { tone: 'far' } }])
			}),
			container,
			{ enhancementCatalog: new Map([[identity, Motion]]) }
		);

		expect(container.innerHTML).toBe(
			'<section><div class="near"><button>Save</button></div></section>'
		);
		expect(setup).toHaveBeenCalledOnce();
		expect(setup).toHaveBeenCalledWith('near');
	});

	it('reroutes a reactive explicit target without activating root-only selector entries', async () => {
		const roots: RootLifecycle<HTMLElement>[] = [];
		const released = vi.fn();
		const Motion = markTestComponent(function Motion(
			this: Component<{}>,
			props: { children?: Child; preset?: string }
		) {
			roots.push(this.refs.root<HTMLElement>());
			this.onUnmount(released);
			return () => props.children;
		});
		const marker = (root: boolean) => createEnhancementMarker([{ identity, props: {}, root }]);
		const Boundary = markTestComponent(function Boundary(
			this: Component<{}>,
			props: { left: boolean }
		) {
			return () =>
				createVNode(
					Fragment,
					null,
					createVNode('button', { id: 'left', __exactEnhancements: marker(props.left) }, 'Left'),
					createVNode('button', { id: 'right', __exactEnhancements: marker(!props.left) }, 'Right')
				);
		});
		const tree = (left: boolean) =>
			createVNode(Boundary, {
				left,
				__exactEnhancements: createEnhancementMarker([{ identity, props: { preset: 'fade' } }])
			});
		const container = document.createElement('div');
		const options = { enhancementCatalog: new Map([[identity, Motion]]) };

		render(tree(true), container, options);
		expect(roots).toHaveLength(1);
		expect(roots[0]?.current?.id).toBe('left');

		render(tree(false), container, options);
		expect(container.innerHTML).toBe(
			'<button id="left">Left</button><button id="right">Right</button>'
		);
		expect(roots.map((root) => root.current?.id)).toEqual([undefined, 'right']);
		expect(roots[0]?.release?.reason).toBe('enhancement-target-rerouted');
		await vi.waitFor(() => expect(released).toHaveBeenCalledOnce());
	});

	it('observes root selector slots without requiring a component rerender', () => {
		const roots: RootLifecycle<HTMLElement>[] = [];
		const Motion = markTestComponent(function Motion(
			this: Component<{}>,
			props: { children?: Child; preset?: string }
		) {
			roots.push(this.refs.root<HTMLElement>());
			return () => props.children;
		});
		const state = reactive({ left: true });
		const left = computed(() => state.left);
		const right = computed(() => !state.left);
		const container = document.createElement('div');
		const Boundary = markTestComponent(function Boundary(this: Component<{}>) {
			return () =>
				createVNode(
					Fragment,
					null,
					createVNode('button', {
						id: 'left',
						__exactEnhancements: createEnhancementMarker([{ identity, props: {}, root: left }])
					}),
					createVNode('button', {
						id: 'right',
						__exactEnhancements: createEnhancementMarker([{ identity, props: {}, root: right }])
					})
				);
		});

		render(
			createVNode(Boundary, {
				__exactEnhancements: createEnhancementMarker([{ identity, props: { preset: 'fade' } }])
			}),
			container,
			{ enhancementCatalog: new Map([[identity, Motion]]) }
		);
		expect(roots[0]?.current?.id).toBe('left');

		state.left = false;
		flushSync();

		expect(roots).toHaveLength(2);
		expect(roots[1]?.current?.id).toBe('right');
	});

	it('leaves unavailable enhancements inert and warns once per root identity', () => {
		const events: LogEvent[] = [];
		const logger: Logger = { log: (event) => events.push(event) };
		const marker = createEnhancementMarker([{ identity, props: { preset: 'fade' } }]);
		const container = document.createElement('div');

		render(createVNode('button', { __exactEnhancements: marker }, 'Save'), container, { logger });
		render(createVNode('button', { __exactEnhancements: marker }, 'Save'), container, { logger });

		expect(container.innerHTML).toBe('<button>Save</button>');
		const warnings = events.filter((event) => event.level === 'warn');
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.message).toContain(identity);
	});

	it('orders co-targeted components from context token effects before setup', () => {
		const token = createContext<string>('enhancement-order', true);
		const observed: string[] = [];
		const Provider = markTestComponent(function Provider(
			this: Component<{}>,
			props: { children?: Child }
		) {
			observed.push('provider');
			this.setContext(token, 'ready');
			return () => props.children;
		});
		markExactEnhancementContexts(Provider, { provides: [token] });
		const Consumer = markTestComponent(function Consumer(
			this: Component<{}>,
			props: { children?: Child }
		) {
			observed.push(`consumer:${this.getContext(token)}`);
			return () => props.children;
		});
		markExactEnhancementContexts(Consumer, { requires: [token] });
		const providerIdentity = '@test/z-provider#default';
		const consumerIdentity = '@test/a-consumer#default';
		const marker = createEnhancementMarker([
			{ identity: consumerIdentity, props: {} },
			{ identity: providerIdentity, props: {} }
		]);
		const container = document.createElement('div');

		render(createVNode('button', { __exactEnhancements: marker }), container, {
			enhancementCatalog: new Map([
				[consumerIdentity, Consumer],
				[providerIdentity, Provider]
			])
		});

		expect(observed).toEqual(['provider', 'consumer:ready']);
	});

	it('rejects context ordering cycles before enhancement setup', () => {
		const leftToken = createContext<string>('enhancement-cycle-left', true);
		const rightToken = createContext<string>('enhancement-cycle-right', true);
		const setup = vi.fn();
		const Left = markTestComponent(function Left(this: Component<{}>, props: { children?: Child }) {
			setup();
			return () => props.children;
		});
		const Right = markTestComponent(function Right(
			this: Component<{}>,
			props: { children?: Child }
		) {
			setup();
			return () => props.children;
		});
		markExactEnhancementContexts(Left, { provides: [leftToken], requires: [rightToken] });
		markExactEnhancementContexts(Right, { provides: [rightToken], requires: [leftToken] });
		const marker = createEnhancementMarker([
			{ identity: '@test/left#default', props: {} },
			{ identity: '@test/right#default', props: {} }
		]);
		const container = document.createElement('div');
		const reported = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			render(createVNode('button', { __exactEnhancements: marker }), container, {
				enhancementCatalog: new Map([
					['@test/left#default', Left],
					['@test/right#default', Right]
				])
			});
			expect(reported).toHaveBeenCalledOnce();
			expect(setup).not.toHaveBeenCalled();
			expect(container.querySelector('[role="alert"]')?.textContent).toContain(
				'Enhancement context ordering cycle: @test/left#default, @test/right#default'
			);
		} finally {
			reported.mockRestore();
		}
	});

	it('lets different enhancements select and structurally wrap different logical targets', () => {
		const leftIdentity = '@test/left-target#default';
		const rightIdentity = '@test/right-target#default';
		const wrapper = (className: string) =>
			markTestComponent(function Wrapper(this: Component<{}>, props: { children?: Child }) {
				return () => createVNode('div', { className }, props.children);
			});
		const container = document.createElement('div');
		const Boundary = markTestComponent(function Boundary(this: Component<{}>) {
			return () =>
				createVNode(
					Fragment,
					null,
					createVNode('button', {
						id: 'left',
						__exactEnhancements: createEnhancementMarker([
							{ identity: leftIdentity, props: {}, root: true }
						])
					}),
					createVNode('button', {
						id: 'right',
						__exactEnhancements: createEnhancementMarker([
							{ identity: rightIdentity, props: {}, root: true }
						])
					})
				);
		});
		render(
			createVNode(Boundary, {
				__exactEnhancements: createEnhancementMarker([
					{ identity: leftIdentity, props: {} },
					{ identity: rightIdentity, props: {} }
				])
			}),
			container,
			{
				enhancementCatalog: new Map([
					[leftIdentity, wrapper('left-shell')],
					[rightIdentity, wrapper('right-shell')]
				])
			}
		);

		expect(container.innerHTML).toBe(
			'<div class="left-shell"><button id="left"></button></div><div class="right-shell"><button id="right"></button></div>'
		);
	});

	it('reroutes an ancestor declaration when a dynamic branch introduces an explicit target', () => {
		const roots: RootLifecycle<HTMLElement>[] = [];
		let owner!: Component<{ explicit: boolean }>;
		const Motion = markTestComponent(function Motion(
			this: Component<{}>,
			props: { children?: Child }
		) {
			roots.push(this.refs.root<HTMLElement>());
			return () => props.children;
		});
		const Card = markTestComponent(function Card(this: Component<{ explicit: boolean }>) {
			owner = this;
			this.state.explicit = false;
			return () =>
				createVNode(
					'section',
					null,
					createDynamicChild(() =>
						createVNode('button', {
							id: 'dynamic',
							...(this.state.explicit
								? {
										__exactEnhancements: createEnhancementMarker([
											{ identity, props: {}, root: true }
										])
									}
								: {})
						})
					)
				);
		});
		const container = document.createElement('div');
		render(
			createVNode(Card, {
				__exactEnhancements: createEnhancementMarker([{ identity, props: { preset: 'fade' } }])
			}),
			container,
			{ enhancementCatalog: new Map([[identity, Motion]]) }
		);
		expect(roots[0]?.current).toBe(container.querySelector('section'));

		owner.state.explicit = true;
		flushSync();

		expect(roots).toHaveLength(2);
		expect(roots[0]?.current).toBeUndefined();
		expect(roots[1]?.current).toBe(container.querySelector('#dynamic'));
	});

	it('resolves explicit targets through logical portal children', () => {
		const portal = document.createElement('div');
		let target!: RootLifecycle<HTMLElement>;
		const Motion = markTestComponent(function Motion(
			this: Component<{}>,
			props: { children?: Child }
		) {
			target = this.refs.root<HTMLElement>();
			return () => props.children;
		});
		const Card = markTestComponent(function Card(this: Component<{}>) {
			return () =>
				createVNode(
					'section',
					null,
					createPortal(
						portal,
						createVNode('button', {
							id: 'portal-target',
							__exactEnhancements: createEnhancementMarker([{ identity, props: {}, root: true }])
						})
					)
				);
		});
		const container = document.createElement('div');
		render(
			createVNode(Card, {
				__exactEnhancements: createEnhancementMarker([{ identity, props: { preset: 'fade' } }])
			}),
			container,
			{ enhancementCatalog: new Map([[identity, Motion]]) }
		);

		expect(target.current).toBe(portal.querySelector('#portal-target'));
		expect(container.querySelector('section')).not.toBeNull();
	});
});
