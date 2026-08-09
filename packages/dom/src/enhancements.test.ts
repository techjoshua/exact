/**
 * @vitest-environment jsdom
 */
import {
	createDynamicChild,
	createEnhancementMarker,
	Fragment,
	Target,
	TargetOverrides,
	type Child,
	type Component,
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
});
