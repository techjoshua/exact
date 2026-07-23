/**
 * @vitest-environment jsdom
 */
import {
	createCompiledVNode,
	createDynamicChild,
	createExpression,
	createVNode,
	Fragment,
	type Child,
	type Component
} from '@exactjs/core';
import { jsx, jsxs } from '@exactjs/jsx';
import { createEffectScope, flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { adoptStatic, render, unmount } from './index.js';
import { mountedDomNodes, placeMountedBefore } from './placement.js';

describe('@exactjs/dom keyed-reconciliation', () => {
	it('moves an adopted boundary as one start-to-end DOM range', () => {
		const container = document.createElement('div');
		const start = document.createComment('exact:component:0');
		const child = document.createElement('p');
		const end = document.createComment('/exact:component:0');
		const anchor = document.createElement('i');
		container.append(start, child, end, anchor);
		function Boundary() {
			return null;
		}
		const mounted = {
			vnode: createVNode(Boundary, null),
			dom: start,
			end,
			scope: createEffectScope(),
			children: [
				{ vnode: createVNode('p', null), dom: child, scope: createEffectScope(), children: [] }
			]
		};
		placeMountedBefore({ debugMarkers: false } as any, container, mounted, anchor);
		expect(mountedDomNodes(mounted)).toEqual([start, child, end]);
		expect(Array.from(container.childNodes)).toEqual([start, child, end, anchor]);
	});

	it('moves only the out-of-order keyed range for a simple rotation', () => {
		const container = document.createElement('div');
		let list!: Component<{ items: string[] }>;
		function List(this: Component<{ items: string[] }>) {
			list = this;
			this.state.items = ['a', 'b', 'c'];
			return () =>
				jsx('ul', {
					children: this.map(
						this.state.items,
						(item) => item,
						(item) => jsx('li', { children: item })
					)
				});
		}
		render(jsx(List, {}), container);
		const original = Node.prototype.insertBefore;
		let placements = 0;
		Node.prototype.insertBefore = function <T extends Node>(
			this: Node,
			node: T,
			before: Node | null
		): T {
			if (this === container.querySelector('ul')) placements++;
			return original.call(this, node, before) as T;
		};
		try {
			list.state.items.splice(0, 3, 'c', 'a', 'b');
			flushSync();
		} finally {
			Node.prototype.insertBefore = original;
		}
		expect(Array.from(container.querySelectorAll('li'), (item) => item.textContent)).toEqual([
			'c',
			'a',
			'b'
		]);
		// One keyed range moves; compiled cells own an anchor and an element.
		expect(placements).toBe(2);
	});

	it('reuses keyed list render results across unrelated parent rerenders', () => {
		const container = document.createElement('div');
		const itemRender = vi.fn((item: { id: string }) => jsx('li', { children: item.id }));
		function List(this: Component<{ tick: number; items: { id: string }[] }>) {
			this.state.tick = 0;
			this.state.items = [{ id: 'a' }, { id: 'b' }];
			return () =>
				jsx('button', {
					onClick: () => this.state.tick++,
					children: [
						String(this.state.tick),
						this.map(this.state.items, (item) => item.id, itemRender)
					]
				});
		}
		render(jsx(List, {}), container);
		expect(itemRender).toHaveBeenCalledTimes(2);
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		flushSync();
		expect(itemRender).toHaveBeenCalledTimes(2);
	});

	it('rejects duplicate this.map keys deterministically', () => {
		const container = document.createElement('div');
		function List(this: Component<{ items: { id: string }[] }>) {
			this.state.items = [{ id: 'same' }, { id: 'same' }];
			return () =>
				jsx('ul', {
					children: this.map(
						this.state.items,
						(item) => item.id,
						(item) => jsx('li', { children: item.id })
					)
				});
		}
		render(jsx(List, {}), container);
		expect(container.textContent).toContain('Duplicate key "same"');
	});

	it('treats an empty string as a stable keyed-list identity', () => {
		const container = document.createElement('div');
		let list!: Component<{ items: string[] }>;
		function List(this: Component<{ items: string[] }>) {
			list = this;
			this.state.items = ['', 'a'];
			return () =>
				jsx('ul', {
					children: this.map(
						this.state.items,
						(item) => item,
						(item) => jsx('li', { children: item || 'empty' })
					)
				});
		}
		render(jsx(List, {}), container);
		const empty = container.querySelectorAll('li')[0];
		list.state.items.reverse();
		flushSync();
		expect(container.querySelectorAll('li')[1]).toBe(empty);
	});

	it('rejects duplicate ordinary vnode keys', () => {
		const container = document.createElement('div');
		function List() {
			return () =>
				jsx('ul', {
					children: [
						jsx('li', { key: 'same', children: 'a' }),
						jsx('li', { key: 'same', children: 'b' })
					]
				});
		}
		render(jsx(List, {}), container);
		expect(container.textContent).toContain('Duplicate key "same"');
	});

	it('does not move keyed cards when an unkeyed marker is inserted beside one', () => {
		const container = document.createElement('div');
		let board!: Component<{ marker?: string }>;
		function Board(this: Component<{ marker?: string }>) {
			board = this;
			this.state.marker = undefined;
			const cards = this.reactive(() => [
				this.state.marker === 'a' ? jsx('i', { children: 'marker' }) : null,
				jsx('button', { 'data-card': 'a', children: 'a' }),
				jsx('button', { 'data-card': 'b', children: 'b' })
			]);
			return () => jsx('section', { children: createDynamicChild(() => cards.get()) });
		}
		render(jsx(Board, {}), container);
		const firstCard = container.querySelector('[data-card="a"]');
		board.state.marker = 'a';
		flushSync();
		expect(Array.from(container.querySelectorAll('i, button'), (node) => node.textContent)).toEqual(
			['marker', 'a', 'b']
		);
		expect(container.querySelector('[data-card="a"]')).toBe(firstCard);
	});

	it('does not reinsert stable cell ranges during a component rerender', () => {
		let instance!: Component<{ label: string }>;

		function Panel(this: Component<{ label: string }>) {
			instance = this;
			this.state.label = 'Alpha';

			return () =>
				jsx('section', {
					children: [
						jsx('span', { children: this.state.label }),
						jsx('strong', { children: 'stable' })
					]
				});
		}

		const container = document.createElement('div');
		render(jsx(Panel, {}), container);
		const span = container.querySelector('span')!;
		const strong = container.querySelector('strong')!;
		const insertBefore = vi.spyOn(Node.prototype, 'insertBefore');

		instance.state.label = 'Beta';
		flushSync();

		expect(container.querySelector('span')).toBe(span);
		expect(container.querySelector('strong')).toBe(strong);
		expect(container.textContent).toBe('Betastable');
		expect(insertBefore).not.toHaveBeenCalled();
		insertBefore.mockRestore();
	});

	it('updates a props.children list fragment without rerendering parent or child', () => {
		let instance!: Component<{ items: { id: string; label: string }[] }>;
		const parentRendered = vi.fn();
		const childRendered = vi.fn();

		function Wrapper(this: Component<{}>, props: { children?: Child | Child[] }) {
			return () => {
				childRendered();
				return jsx('section', { children: props.children });
			};
		}

		function Parent(this: Component<{ items: { id: string; label: string }[] }>) {
			instance = this;
			this.state.items = [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' }
			];

			return () => {
				parentRendered();
				return jsx(Wrapper, {
					children: this.map(
						this.state.items,
						(item) => item.id,
						(item) => jsx('span', { children: item.label })
					)
				});
			};
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);

		instance.state.items = [
			{ id: 'b', label: 'B' },
			{ id: 'a', label: 'A' },
			{ id: 'c', label: 'C' }
		];
		flushSync();

		expect(Array.from(container.querySelectorAll('span')).map((item) => item.textContent)).toEqual([
			'B',
			'A',
			'C'
		]);
		expect(parentRendered).toHaveBeenCalledTimes(1);
		expect(childRendered).toHaveBeenCalledTimes(1);
	});

	it('reuses keyed list nodes across reorder', () => {
		let instance!: Component<{ items: { id: string; label: string }[] }>;
		const rendered = vi.fn();

		function List(this: Component<{ items: { id: string; label: string }[] }>) {
			instance = this;
			this.state.items = [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' }
			];

			return () => {
				rendered();
				return jsxs('ul', {
					children: this.map(
						this.state.items,
						(item) => item.id,
						(item) => jsx('li', { children: item.label })
					)
				});
			};
		}

		const container = document.createElement('div');
		render(jsx(List, {}), container);
		const firstB = container.querySelectorAll('li')[1];

		instance.state.items = [
			{ id: 'b', label: 'B' },
			{ id: 'a', label: 'A' }
		];
		flushSync();

		expect(container.querySelectorAll('li')[0]).toBe(firstB);
		expect(rendered).toHaveBeenCalledTimes(1);
	});

	it('keeps queued reactive bindings active when keyed nodes move', () => {
		let instance!: Component<{ items: { id: string; label: string }[] }>;
		const rendered = vi.fn();

		function Row(this: Component<{}>, props: { item: { id: string; label: string } }) {
			return () => {
				rendered();
				return createCompiledVNode(
					'li',
					{
						title: createExpression(() => props.item.label)
					},
					createExpression(() => props.item.label)
				);
			};
		}

		function List(this: Component<{ items: { id: string; label: string }[] }>) {
			instance = this;
			this.state.items = [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' }
			];

			return () =>
				createCompiledVNode(
					'ul',
					{},
					this.map(
						this.state.items,
						(item) => item.id,
						(item) => createCompiledVNode(Row, { item })
					)
				);
		}

		const container = document.createElement('div');
		render(createCompiledVNode(List, {}), container);
		const rows = Array.from(container.querySelectorAll('li'));
		const moved = rows[1]!;

		instance.state.items[1]!.label = 'B+';
		instance.state.items = [instance.state.items[1]!, instance.state.items[0]!];
		flushSync();

		expect(container.querySelectorAll('li')[0]).toBe(moved);
		expect(container.contains(moved)).toBe(true);
		expect(moved.textContent).toBe('B+');
		expect(moved.title).toBe('B+');
		expect(rendered).toHaveBeenCalledTimes(2);
	});

	it('updates keyed child component props when list item fields mutate', () => {
		let instance!: Component<{ items: { id: string; label: string; priority: string }[] }>;
		const rendered = vi.fn();

		function Row(
			this: Component<{}>,
			props: { item: { id: string; label: string; priority: string } }
		) {
			return () => {
				rendered();
				return createCompiledVNode(
					'li',
					{},
					createCompiledVNode(
						'strong',
						{},
						createExpression(() => props.item.label)
					),
					createCompiledVNode(
						'span',
						{},
						createExpression(() => props.item.priority)
					)
				);
			};
		}

		function List(this: Component<{ items: { id: string; label: string; priority: string }[] }>) {
			instance = this;
			this.state.items = [
				{ id: 'a', label: 'A', priority: 'medium' },
				{ id: 'b', label: 'B', priority: 'low' }
			];

			return () =>
				createCompiledVNode(
					'ul',
					{},
					this.map(
						this.state.items,
						(item) => item.id,
						(item) => createCompiledVNode(Row, { item })
					)
				);
		}

		const container = document.createElement('div');
		render(createCompiledVNode(List, {}), container);
		const rows = Array.from(container.querySelectorAll('li'));

		instance.state.items[0]!.label = 'A+';
		instance.state.items[0]!.priority = 'high';
		flushSync();

		expect(Array.from(container.querySelectorAll('li'))).toEqual(rows);
		expect(container.querySelectorAll('li')[0]!.textContent).toBe('A+high');
		expect(rendered).toHaveBeenCalledTimes(2);
	});

	it('does not reuse keyed children as unkeyed siblings during patching', () => {
		let instance!: Component<{ label: string }>;

		function Panel(this: Component<{ label: string }>) {
			instance = this;
			this.state.label = 'first';

			return () =>
				jsx('section', {
					children: [
						jsx('h1', { children: 'Heading' }),
						jsx('article', { key: 'report', children: this.state.label })
					]
				});
		}

		const container = document.createElement('div');
		render(jsx(Panel, {}), container);
		const heading = container.querySelector('h1')!;
		const article = container.querySelector('article')!;

		instance.state.label = 'second';
		flushSync();

		expect(container.querySelector('h1')).toBe(heading);
		expect(container.querySelector('article')).toBe(article);
		expect(container.textContent).toBe('Headingsecond');
	});

	it('adds a keyed child without rerendering the parent', () => {
		let instance!: Component<{ items: { id: string; label: string }[] }>;
		const rendered = vi.fn();

		function List(this: Component<{ items: { id: string; label: string }[] }>) {
			instance = this;
			this.state.items = [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' }
			];

			return () => {
				rendered();
				return jsxs('ul', {
					children: this.map(
						this.state.items,
						(item) => item.id,
						(item) => jsx('li', { children: item.label })
					)
				});
			};
		}

		const container = document.createElement('div');
		render(jsx(List, {}), container);

		instance.state.items = [
			{ id: 'a', label: 'A' },
			{ id: 'b', label: 'B' },
			{ id: 'c', label: 'C' }
		];
		flushSync();

		expect(Array.from(container.querySelectorAll('li')).map((item) => item.textContent)).toEqual([
			'A',
			'B',
			'C'
		]);
		expect(rendered).toHaveBeenCalledTimes(1);
	});

	it('preserves keyed child component instances across reorder', () => {
		let list!: Component<{ items: { id: string; label: string }[] }>;
		const constructed: string[] = [];
		const rendered = vi.fn();

		function Row(this: Component<{}>, props: { id: string; label: string }) {
			constructed.push(String(props.id));
			return () => {
				rendered();
				return jsx('li', { children: props.label });
			};
		}

		function List(this: Component<{ items: { id: string; label: string }[] }>) {
			list = this;
			this.state.items = [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' }
			];

			return () =>
				jsxs('ul', {
					children: this.map(
						this.state.items,
						(item) => item.id,
						(item) => jsx(Row, { id: item.id, label: item.label })
					)
				});
		}

		const container = document.createElement('div');
		render(jsx(List, {}), container);
		const firstB = container.querySelectorAll('li')[1];

		list.state.items = [
			{ id: 'b', label: 'B' },
			{ id: 'a', label: 'A' }
		];
		flushSync();

		expect(container.querySelectorAll('li')[0]).toBe(firstB);
		expect(constructed).toEqual(['a', 'b']);
		expect(rendered).toHaveBeenCalledTimes(2);
	});

	it('remounts without retaining or duplicating delegated root listeners', () => {
		const container = document.createElement('div');
		const add = vi.spyOn(container, 'addEventListener');
		const remove = vi.spyOn(container, 'removeEventListener');
		const first = vi.fn();
		const second = vi.fn();

		render(jsx('button', { onClick: first, children: 'first' }), container);
		container.querySelector('button')!.click();
		expect(first).toHaveBeenCalledTimes(1);
		expect(add.mock.calls.filter(([type]) => type === 'click')).toHaveLength(1);

		expect(unmount(container)).toBe(true);
		expect(remove.mock.calls.filter(([type]) => type === 'click')).toHaveLength(1);

		render(jsx('button', { onClick: second, children: 'second' }), container);
		container.querySelector('button')!.click();
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
		expect(add.mock.calls.filter(([type]) => type === 'click')).toHaveLength(2);

		unmount(container);
		expect(remove.mock.calls.filter(([type]) => type === 'click')).toHaveLength(2);
	});

	it('rolls back listeners and ownership when SSR adoption fails partway', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<!--exact:component:0--><button>server</button><span>mismatch</span><!--/exact:component:0-->';
		const serverButton = container.querySelector('button')!;
		const remove = vi.spyOn(container, 'removeEventListener');
		const clicked = vi.fn();
		const vnode = createVNode(
			Fragment,
			null,
			createVNode('button', { onClick: clicked }, 'server'),
			createVNode('p', null, 'expected')
		);

		expect(adoptStatic(vnode, container)).toBe(false);
		expect(remove.mock.calls.filter(([type]) => type === 'click')).toHaveLength(1);
		serverButton.click();
		expect(clicked).not.toHaveBeenCalled();
		expect(unmount(container)).toBe(false);
	});
});
