/**
 * @vitest-environment jsdom
 */
import {
	Fragment,
	createCompiledVNode,
	createDynamicChild,
	createRef,
	createVNode,
	type Component
} from '@exactjs/core';
import { render } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { renderToString } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import { hydrate } from './index.js';
import { noopLogger } from './test-support/responses.js';

describe('@exactjs/hydrate adoption', () => {
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
});
