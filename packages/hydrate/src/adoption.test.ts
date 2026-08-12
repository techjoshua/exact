/**
 * @vitest-environment jsdom
 */
import {
	Fragment,
	Target,
	createEnhancementMarker,
	createCompiledComponentRegistry,
	createDynamicChild,
	createRef,
	markExactComponent,
	unsafeHtml,
	type Child,
	type Component,
	type LogEvent,
	type Logger,
	type RootLifecycle
} from '@exactjs/core';
import {
	createCompiledDynamicComponent,
	createServerDynamicComponent
} from '@exactjs/core/runtime/dynamic-components';
import { createCompiledVNode, createVNode } from './test-support/native-vnode.js';
import { render } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { renderToString } from '@exactjs/ssr';
import { describe, expect, it, vi } from 'vitest';
import { hydrate } from './index.js';
import { hydrate as hydrateEnhanced } from './enhanced.js';
import { noopLogger } from './test-support/responses.js';

describe('@exactjs/hydrate adoption', () => {
	it('claims the deterministic progressive helper when the root hydrates', () => {
		const root = document.createElement('div');
		root.id = 'page';
		root.innerHTML = '<p>ready</p>';
		let hash = 2166136261;
		for (const character of root.id) {
			hash ^= character.charCodeAt(0);
			hash = Math.imul(hash, 16777619);
		}
		const helper = `__xR${(hash >>> 0).toString(36)}`;
		(globalThis as Record<string, unknown>)[helper] = () => undefined;
		hydrate(createVNode('p', null, 'ready'), root, {
			allowMarkerless: true,
			logger: noopLogger
		});
		expect(helper in globalThis).toBe(false);
	});

	it('adopts target-forwarded attributes without replacing the intrinsic', () => {
		const vnode = createVNode(
			Target,
			{ className: 'forwarded', 'aria-describedby': 'help' },
			createVNode('button', { className: 'authored' }, 'Save')
		);
		const root = document.createElement('div');
		root.innerHTML = renderToString(vnode).html;
		const serverButton = root.querySelector('button')!;

		hydrate(vnode, root, { logger: noopLogger });

		expect(root.querySelector('button')).toBe(serverButton);
		expect(serverButton.className).toBe('authored forwarded');
		expect(serverButton.getAttribute('aria-describedby')).toBe('help');
	});

	it('adopts nested target owners with independent refs and event subscriptions', () => {
		const calls: string[] = [];
		const refs: Element[] = [];
		const ref = { fulfill: (value: unknown) => value instanceof Element && refs.push(value) };
		const vnode = createVNode(
			Target,
			{ className: 'outer', ref, onClick: () => calls.push('outer') },
			createVNode(
				Target,
				{ className: 'inner', ref, onClick: () => calls.push('inner') },
				createVNode(
					'button',
					{
						className: 'authored',
						ref,
						onClick: (event: Event) => {
							calls.push('authored');
							event.stopImmediatePropagation();
						}
					},
					'Save'
				)
			)
		);
		const root = document.createElement('div');
		root.innerHTML = renderToString(vnode).html;
		const serverButton = root.querySelector('button')!;

		hydrate(vnode, root, { logger: noopLogger });
		serverButton.click();

		expect(root.querySelector('button')).toBe(serverButton);
		expect(serverButton.className).toBe('authored inner outer');
		expect(refs).toEqual([serverButton, serverButton, serverButton]);
		expect(calls).toEqual(['authored']);
	});

	it('activates bundle-local enhancements after adopting their authored target', () => {
		const identity = '@exactjs/hydrate:test-enhancement#default';
		const roots: RootLifecycle<HTMLElement>[] = [];
		const Enhancement = markExactComponent(function Enhancement(
			this: Component<{}>,
			props: { children?: Child }
		) {
			roots.push(this.refs.root<HTMLElement>());
			return () => props.children;
		}, '@exactjs/hydrate:test-enhancement');
		function Page(this: Component<{}>) {
			return () =>
				createVNode(
					'button',
					{
						__exactEnhancements: createEnhancementMarker([{ identity, props: {} }])
					},
					'Save'
				);
		}
		const root = document.createElement('div');
		const enhancementCatalog = new Map([[identity, Enhancement]]);
		root.innerHTML = renderToString(createVNode(Page, null), { enhancementCatalog }).html;
		const serverNode = root.querySelector('button')!;

		hydrateEnhanced(createVNode(Page, null), root, {
			logger: noopLogger,
			enhancementCatalog
		});

		expect(root.querySelector('button')).toBe(serverNode);
		expect(roots).toHaveLength(2);
		expect(roots[0]?.current).toBeUndefined();
		expect(roots[1]?.current).toBe(serverNode);
	});

	it('preserves dirty form state entered before hydration', () => {
		const container = document.createElement('div');
		container.innerHTML = '<!--exact:fragment:0--><input value=server><!--/exact:fragment:0-->';
		const input = container.querySelector('input')!;
		input.value = 'typed';
		hydrate(createVNode(Fragment, null, createVNode('input', { value: 'server' })), container, {
			logger: noopLogger
		});
		expect(container.querySelector('input')?.value).toBe('typed');
	});

	it('publishes preserved dirty state through the compiled binding', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<!--exact:fragment:0--><input data-exact-id=name value=server><!--/exact:fragment:0-->';
		const input = container.querySelector('input')!;
		input.value = 'typed';
		let value = 'server';
		hydrate(
			createVNode(
				Fragment,
				null,
				createVNode('input', {
					'data-exact-id': 'name',
					value,
					__exactBindInput: (event: Event) => {
						value = (event.currentTarget as HTMLInputElement).value;
					}
				})
			),
			container,
			{ logger: noopLogger }
		);

		expect(value).toBe('typed');
	});

	it('adopts and publishes disclosure changes made before hydration', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<!--exact:fragment:0--><details data-exact-id=more data-exact-ssr-open=false></details><!--/exact:fragment:0-->';
		const details = container.querySelector('details')!;
		details.open = true;
		let open = false;
		hydrate(
			createVNode(
				Fragment,
				null,
				createVNode('details', {
					'data-exact-id': 'more',
					open,
					__exactBindToggle: (event: Event) => {
						open = (event.currentTarget as HTMLDetailsElement).open;
					}
				})
			),
			container,
			{ logger: noopLogger }
		);

		expect(container.querySelector('details')?.open).toBe(true);
		expect(open).toBe(true);
	});

	it('makes hydration idempotent and exposes idempotent disposal', () => {
		const container = document.createElement('div');
		container.innerHTML = '<!--exact:fragment:0--><p>server</p><!--/exact:fragment:0-->';
		const vnode = createVNode(Fragment, null, createVNode('p', null, 'server'));
		const first = hydrate(vnode, container, { logger: noopLogger });
		expect(hydrate(vnode, container, { logger: noopLogger })).toBe(first);
		first.dispose();
		first.dispose();
		expect(() => first.applyPatches([])).toThrow('disposed');
	});

	it('adopts compatible static marker-wrapped SSR nodes', () => {
		const root = document.createElement('div');
		root.innerHTML = '<!--exact:component:0--><p class="ready">server</p><!--/exact:component:0-->';
		const serverNode = root.querySelector('p')!;
		const observations: unknown[] = [];
		hydrate(createVNode('p', { className: 'ready' }, 'server'), root, {
			logger: noopLogger,
			onHydration: (observation) => observations.push(observation)
		});
		expect(root.querySelector('p')).toBe(serverNode);
		expect(root.querySelectorAll('p')).toHaveLength(1);
		expect(observations).toEqual([{ kind: 'root', outcome: 'adopted', markers: 'exact' }]);
	});

	it('adopts normalized static class-list values without replacing the server node', () => {
		const root = document.createElement('div');
		root.innerHTML =
			'<!--exact:component:0--><p class="panel active">server</p><!--/exact:component:0-->';
		const serverNode = root.querySelector('p');

		hydrate(
			createVNode('p', { className: ['panel', { active: true, hidden: false }] }, 'server'),
			root,
			{ logger: noopLogger }
		);

		expect(root.querySelector('p')).toBe(serverNode);
	});

	it('adopts opted-in iframe srcdoc through the unsafe HTML capability', () => {
		const root = document.createElement('div');
		root.innerHTML =
			'<!--exact:component:0--><iframe srcdoc="&lt;p&gt;trusted&lt;/p&gt;"></iframe><!--/exact:component:0-->';
		const serverNode = root.querySelector('iframe');
		const audit: Array<{ characters: number }> = [];
		hydrate(createVNode('iframe', { srcdoc: unsafeHtml('<p>trusted</p>') }), root, {
			logger: noopLogger,
			allowUnsafeHtml: true,
			onUnsafeHtml: (event) => audit.push(event)
		});
		expect(root.querySelector('iframe')).toBe(serverNode);
		expect(audit).toEqual([{ characters: 14 }]);
	});

	it('patches an adopted static root without appending a second tree', () => {
		const root = document.createElement('div');
		root.innerHTML = '<!--exact:component:0--><p>server</p><!--/exact:component:0-->';
		const serverNode = root.querySelector('p')!;
		hydrate(createVNode('p', null, 'server'), root, { logger: noopLogger });
		render(createVNode('p', null, 'client'), root);
		expect(root.querySelectorAll('p')).toHaveLength(1);
		expect(root.querySelector('p')).toBe(serverNode);
		expect(root.textContent).toBe('client');
	});

	it('adopts an SSR root component boundary without replacing its DOM', () => {
		const root = document.createElement('div');
		function Greeting(this: Component<{}>) {
			return () => createVNode('p', null, 'hello');
		}
		root.innerHTML = renderToString(createVNode(Greeting, null)).html;
		const serverNode = root.querySelector('p')!;
		hydrate(createVNode(Greeting, null), root, { logger: noopLogger });
		expect(root.querySelector('p')).toBe(serverNode);
		render(createVNode(Greeting, null), root);
		expect(root.querySelector('p')).toBe(serverNode);
	});

	it('adopts nested component marker boundaries', () => {
		const root = document.createElement('div');
		function Child(this: Component<{}>) {
			return () => createVNode('em', null, 'child');
		}
		function Parent(this: Component<{}>) {
			return () => createVNode('section', null, createVNode(Child, null));
		}
		root.innerHTML = renderToString(createVNode(Parent, null)).html;
		const serverChild = root.querySelector('em')!;
		hydrate(createVNode(Parent, null), root, { logger: noopLogger });
		expect(root.querySelector('em')).toBe(serverChild);
	});

	it('adopts compiler cell marker boundaries', () => {
		const root = document.createElement('div');
		let instance!: Component<{ label: string }>;
		function Label(this: Component<{ label: string }>) {
			instance = this;
			this.state.label = 'server';
			return () => createCompiledVNode('p', null, this.state.label);
		}
		root.innerHTML = renderToString(createVNode(Label, null)).html;
		const serverNode = root.querySelector('p')!;
		hydrate(createVNode(Label, null), root, { logger: noopLogger });
		instance.state.label = 'client';
		flushSync();
		expect(root.querySelector('p')).toBe(serverNode);
		expect(root.querySelector('p')?.textContent).toBe('client');
	});

	it('adopts a compiler cell at the hydration root without replacing server DOM', () => {
		const root = document.createElement('div');
		function Label(this: Component<{}>, props: { label: string }) {
			return () => createCompiledVNode('p', null, props.label);
		}
		const vnode = createCompiledVNode(Label, { label: 'server' });
		root.innerHTML = renderToString(vnode).html;
		const serverNode = root.querySelector('p')!;

		hydrate(vnode, root, { logger: noopLogger });

		expect(root.querySelector('p')).toBe(serverNode);
		hydrate(createCompiledVNode(Label, { label: 'client' }), root, { logger: noopLogger });
		expect(root.querySelector('p')).toBe(serverNode);
		expect(serverNode.textContent).toBe('client');
	});

	it('adopts keyed SSR item ranges and reorders their existing DOM', () => {
		const root = document.createElement('div');
		let instance!: Component<{ items: { id: string; title: string }[] }>;
		function List(this: Component<{ items: { id: string; title: string }[] }>) {
			instance = this;
			this.state.items = [
				{ id: 'a', title: 'A' },
				{ id: 'b', title: 'B' }
			];
			return () =>
				createVNode(
					'ul',
					null,
					this.map(
						this.state.items,
						(item) => item.id,
						(item) => createVNode('li', null, item.title),
						'tasks'
					)
				);
		}
		root.innerHTML = renderToString(createVNode(List, null)).html;
		const [a, b] = Array.from(root.querySelectorAll('li'));
		hydrate(createVNode(List, null), root, { logger: noopLogger });
		instance.state.items.splice(0, 2, { id: 'b', title: 'B' }, { id: 'a', title: 'A' });
		flushSync();
		expect(Array.from(root.querySelectorAll('li'))).toEqual([b, a]);
	});

	it('adopts a dynamic marker range and updates it after hydration', () => {
		const root = document.createElement('div');
		let client!: Component<{ label: string }>;
		function Label(this: Component<{ label: string }>) {
			client = this;
			this.state.label = 'server';
			return () =>
				createVNode(
					'p',
					null,
					createDynamicChild(() => this.state.label)
				);
		}
		root.innerHTML = renderToString(createVNode(Label, null)).html;
		const serverNode = root.querySelector('p')!;
		hydrate(createVNode(Label, null), root, { logger: noopLogger });
		client.state.label = 'client';
		flushSync();
		expect(root.querySelector('p')).toBe(serverNode);
		expect(root.querySelector('p')?.textContent).toBe('client');
	});

	it('activates a client-only dynamic component inside its SSR-owned range', () => {
		const root = document.createElement('div');
		let serverPhase = true;
		function ClientPanel() {
			return () => createVNode('strong', null, 'activated');
		}
		function Page() {
			const dynamic = serverPhase
				? createServerDynamicComponent('fixture:hydrated-dynamic')
				: createCompiledDynamicComponent({
						id: 'fixture:hydrated-dynamic',
						source: () => ClientPanel,
						props: {}
					});
			return () =>
				createVNode(
					'div',
					null,
					createVNode('span', null, 'before'),
					dynamic,
					createVNode('span', null, 'after')
				);
		}
		markExactComponent(ClientPanel, 'fixture:hydrated-dynamic-panel');
		markExactComponent(Page, 'fixture:hydrated-dynamic-page');
		root.innerHTML = renderToString(createVNode(Page, null)).html;
		const siblings = root.querySelectorAll('span');
		const before = siblings[0];
		const after = siblings[1];
		serverPhase = false;

		const diagnostics: string[] = [];
		hydrate(createVNode(Page, null), root, {
			logger: noopLogger,
			onDiagnostic: (diagnostic) => diagnostics.push(`${diagnostic.code}:${diagnostic.message}`)
		});
		expect(root.textContent).toBe('beforeactivatedafter');
		expect(diagnostics).toEqual([]);
		expect(root.querySelectorAll('span')[0]).toBe(before);
		expect(root.querySelectorAll('span')[1]).toBe(after);
	});

	it('attaches JSX events while adopting a component root', () => {
		const root = document.createElement('div');
		function Counter(this: Component<{ count: number }>) {
			this.state.count = 0;
			return () =>
				createVNode(
					'button',
					{
						onClick: () => this.state.count++
					},
					String(this.state.count)
				);
		}
		root.innerHTML = renderToString(createVNode(Counter, null)).html;
		hydrate(createVNode(Counter, null), root, { logger: noopLogger });
		const button = root.querySelector('button')!;
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		flushSync();
		expect(button.textContent).toBe('1');
	});

	it('propagates the hydration logger into adopted component interactions', async () => {
		const root = document.createElement('div');
		const events: LogEvent[] = [];
		const logger: Logger = {
			isEnabled: (level) => level === 'trace',
			log: (event) => events.push(event)
		};
		function Counter(this: Component<{ count: number }>) {
			this.state.count = 0;
			return () =>
				createVNode('button', { onClick: () => this.state.count++ }, String(this.state.count));
		}
		root.innerHTML = renderToString(createVNode(Counter, null)).html;
		hydrate(createVNode(Counter, null), root, { logger });

		root.querySelector('button')!.click();
		await vi.waitFor(() =>
			expect(events.some((event) => event.message === 'performance interaction settled')).toBe(true)
		);
	});

	it('fulfills component refs while adopting existing elements', () => {
		const root = document.createElement('div');
		const buttonRef = createRef<HTMLButtonElement>('hydrated-button');
		let instance!: Component<{}>;
		function Button(this: Component<{}>) {
			instance = this;
			return () => createVNode('button', { ref: this.ref(buttonRef) }, 'save');
		}
		root.innerHTML = renderToString(createVNode(Button, null)).html;
		const serverNode = root.querySelector('button')!;
		hydrate(createVNode(Button, null), root, { logger: noopLogger });
		expect(instance.refs.get(buttonRef)).toBe(serverNode);
	});

	it('adopts static fragment siblings inside a marker range', () => {
		const root = document.createElement('div');
		root.innerHTML = '<!--exact:fragment:0--><p>one</p><p>two</p><!--/exact:fragment:0-->';
		const [first, second] = Array.from(root.querySelectorAll('p'));
		hydrate(
			createVNode(Fragment, null, createVNode('p', null, 'one'), createVNode('p', null, 'two')),
			root,
			{ logger: noopLogger }
		);
		expect(root.querySelectorAll('p')[0]).toBe(first);
		expect(root.querySelectorAll('p')[1]).toBe(second);
	});

	it('adopts nested static fragments inside a marker range', () => {
		const root = document.createElement('div');
		root.innerHTML = '<!--exact:fragment:0--><p>one</p><p>two</p><!--/exact:fragment:0-->';
		const [first, second] = Array.from(root.querySelectorAll('p'));
		hydrate(
			createVNode(
				Fragment,
				null,
				createVNode(Fragment, null, createVNode('p', null, 'one'), createVNode('p', null, 'two'))
			),
			root,
			{ logger: noopLogger }
		);
		expect(root.querySelectorAll('p')[0]).toBe(first);
		expect(root.querySelectorAll('p')[1]).toBe(second);
	});

	it('remounts static markup when SSR includes an unexpected attribute', () => {
		const root = document.createElement('div');
		root.innerHTML =
			'<!--exact:component:0--><p data-stale="yes">server</p><!--/exact:component:0-->';
		const serverNode = root.querySelector('p')!;
		hydrate(createVNode('p', null, 'server'), root, { logger: noopLogger });
		expect(root.querySelector('p')).not.toBe(serverNode);
		expect(root.querySelector('p')?.hasAttribute('data-stale')).toBe(false);
	});

	it('repairs only the mismatched child of an adopted static fragment', () => {
		const root = document.createElement('div');
		root.innerHTML = '<!--exact:fragment:0--><p>one</p><p>stale</p><!--/exact:fragment:0-->';
		const first = root.querySelectorAll('p')[0]!;
		const stale = root.querySelectorAll('p')[1]!;
		hydrate(
			createVNode(Fragment, null, createVNode('p', null, 'one'), createVNode('p', null, 'two')),
			root,
			{ logger: noopLogger }
		);
		expect(root.querySelectorAll('p')[0]).toBe(first);
		expect(root.querySelectorAll('p')[1]).toBe(stale);
		expect(root.textContent).toBe('onetwo');
	});

	it('repairs a stale static attribute without replacing compatible siblings', () => {
		const root = document.createElement('div');
		root.innerHTML =
			'<!--exact:fragment:0--><p class="stale">one</p><p>two</p><!--/exact:fragment:0-->';
		const stale = root.querySelectorAll('p')[0]!;
		const sibling = root.querySelectorAll('p')[1]!;
		hydrate(
			createVNode(
				Fragment,
				null,
				createVNode('p', { className: 'fresh' }, 'one'),
				createVNode('p', null, 'two')
			),
			root,
			{ logger: noopLogger }
		);
		expect(root.querySelectorAll('p')[0]).toBe(stale);
		expect(root.querySelectorAll('p')[0]?.className).toBe('fresh');
		expect(root.querySelectorAll('p')[1]).toBe(sibling);
	});

	it('restores focus and selection when local static repair replaces an input', () => {
		const root = document.createElement('div');
		document.body.appendChild(root);
		root.innerHTML =
			'<!--exact:fragment:0--><input value="stale"><p>stable</p><!--/exact:fragment:0-->';
		const input = root.querySelector('input')!;
		input.focus();
		input.setSelectionRange(1, 3);
		try {
			hydrate(
				createVNode(
					Fragment,
					null,
					createVNode('input', { value: 'fresh' }),
					createVNode('p', null, 'stable')
				),
				root,
				{ logger: noopLogger }
			);
			const repaired = root.querySelector('input')!;
			expect(document.activeElement).toBe(repaired);
			expect(repaired.selectionStart).toBe(1);
			expect(repaired.selectionEnd).toBe(3);
		} finally {
			root.remove();
		}
	});

	it('hydrates by falling back to normal render when markers are missing', () => {
		const container = document.createElement('div');

		hydrate(createVNode('p', null, 'ready'), container, { logger: noopLogger });

		expect(container.querySelector('p')?.textContent).toBe('ready');
	});

	it('recovers a mismatched registry entry without replacing adjacent adopted DOM', () => {
		function First() {
			return () => createVNode('p', null, 'first');
		}
		function Second() {
			return () => createVNode('p', null, 'second');
		}
		markExactComponent(First, '@exactjs/hydrate:test:FirstRegistryEntry');
		markExactComponent(Second, '@exactjs/hydrate:test:SecondRegistryEntry');
		const View = createCompiledComponentRegistry('test:adoption', 'AdoptionView', () => ({
			first: First,
			second: Second
		}));
		let selected: 'first' | 'second' = 'first';
		function Parent() {
			const Current = View[selected];
			return () =>
				createVNode(
					Fragment,
					null,
					createVNode('span', null, 'stable'),
					createVNode(Current, null)
				);
		}
		const container = document.createElement('div');
		container.innerHTML = renderToString(createVNode(Parent, null)).html;
		const stable = container.querySelector('span');
		selected = 'second';

		hydrate(createVNode(Parent, null), container, { logger: noopLogger });

		expect(container.querySelector('span')).toBe(stable);
		expect(container.querySelector('p')?.textContent).toBe('second');
	});
});
