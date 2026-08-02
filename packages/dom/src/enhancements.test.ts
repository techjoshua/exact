/**
 * @vitest-environment jsdom
 */
import {
	createContext,
	createEnhancementMarker,
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
import { createVNode } from './test-support/native-vnode.js';

const identity = '@test/motion#motion';

describe('renderer enhancements', () => {
	it('activates a transparent plugin as an ordinary component around its intrinsic target', () => {
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

	it('allows an active plugin component to wrap its target', () => {
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
		const marker = (root: boolean) =>
			createEnhancementMarker([{ identity, props: {}, root }]);
		const tree = (left: boolean) =>
			createVNode(
				'section',
				{
					__exactEnhancements: createEnhancementMarker([
						{ identity, props: { preset: 'fade' } }
					])
				},
				createVNode('button', { id: 'left', __exactEnhancements: marker(left) }, 'Left'),
				createVNode('button', { id: 'right', __exactEnhancements: marker(!left) }, 'Right')
			);
		const container = document.createElement('div');
		const options = { enhancementCatalog: new Map([[identity, Motion]]) };

		render(tree(true), container, options);
		expect(roots).toHaveLength(1);
		expect(roots[0]?.current?.id).toBe('left');

		render(tree(false), container, options);
		expect(container.innerHTML).toBe(
			'<section><button id="left">Left</button><button id="right">Right</button></section>'
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

		render(
			createVNode(
				'section',
				{
					__exactEnhancements: createEnhancementMarker([
						{ identity, props: { preset: 'fade' } }
					])
				},
				createVNode('button', {
					id: 'left',
					__exactEnhancements: createEnhancementMarker([{ identity, props: {}, root: left }])
				}),
				createVNode('button', {
					id: 'right',
					__exactEnhancements: createEnhancementMarker([{ identity, props: {}, root: right }])
				})
			),
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

	it('rejects context ordering cycles before plugin setup', () => {
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
});
