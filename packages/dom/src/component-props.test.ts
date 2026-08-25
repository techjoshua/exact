/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/lists';
import { type Child, type Component } from '@exactjs/core';
import { createDynamicChild, createExpression } from '@exactjs/core/runtime/render';
import { createCompiledVNode, jsx, jsxs } from './test-support/native-vnode.js';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { render } from './index.js';

describe('@exactjs/dom component-props', () => {
	it('updates a derived prop collection when a canonical record changes membership', () => {
		const container = document.createElement('div');
		let board!: Component<{ tasks: { id: string; status: string }[] }>;
		function Column(
			this: Component<{}>,
			props: { tasks: { id: string; status: string }[]; status: string }
		) {
			// This mirrors compiler output for a component-local filtered list.
			const columnTasks = this.reactive(() =>
				props.tasks.filter((task) => task.status === props.status)
			);
			return () =>
				jsx('ul', {
					children: this.map(
						columnTasks,
						(task) => task.id,
						(task) => jsx('li', { children: task.id })
					)
				});
		}
		function Board(this: Component<{ tasks: { id: string; status: string }[] }>) {
			board = this;
			this.state.tasks = [
				{ id: 'a', status: 'todo' },
				{ id: 'b', status: 'done' }
			];
			return () =>
				jsx('section', {
					children: [
						jsx(Column, { tasks: this.state.tasks, status: 'todo' }),
						jsx(Column, { tasks: this.state.tasks, status: 'done' })
					]
				});
		}
		render(jsx(Board, {}), container);
		board.state.tasks[1]!.status = 'todo';
		flushSync();
		expect(Array.from(container.querySelectorAll('ul'), (list) => list.textContent)).toEqual([
			'ab',
			''
		]);
	});

	it('updates compiled prop and text bindings without rerendering the component', () => {
		let instance!: Component<{ label: string; tone: string }>;
		const rendered = vi.fn();

		function Label(this: Component<{ label: string; tone: string }>) {
			instance = this;
			this.state.label = 'Ready';
			this.state.tone = 'red';

			return () => {
				rendered();
				return createCompiledVNode(
					'span',
					{
						title: createExpression(() => this.state.label),
						style: { color: createExpression(() => this.state.tone) }
					},
					createDynamicChild(() => this.state.label)
				);
			};
		}

		const container = document.createElement('div');
		render(createCompiledVNode(Label, {}), container);
		const span = container.querySelector('span')!;

		expect(span.textContent).toBe('Ready');
		expect(span.title).toBe('Ready');
		expect(span.style.color).toBe('red');

		instance.state.label = 'Done';
		instance.state.tone = 'blue';
		flushSync();

		expect(span.textContent).toBe('Done');
		expect(span.title).toBe('Done');
		expect(span.style.color).toBe('blue');
		expect(rendered).toHaveBeenCalledTimes(1);
	});

	it('unwraps reactive component props when children read them', () => {
		let parent!: Component<{ items: { id: string; status: 'open' | 'done' }[] }>;
		const parentRendered = vi.fn();
		const childRendered = vi.fn();

		function Column(
			this: Component<{}>,
			props: { items: { id: string; status: 'open' | 'done' }[] }
		) {
			return () => {
				childRendered();
				return jsxs('section', {
					children: [
						jsx('span', { children: props.items.length }),
						jsx('ul', {
							children: props.items.map((item) => jsx('li', { children: item.id }))
						})
					]
				});
			};
		}

		function Board(this: Component<{ items: { id: string; status: 'open' | 'done' }[] }>) {
			parent = this;
			this.state.items = [
				{ id: 'a', status: 'open' },
				{ id: 'b', status: 'done' }
			];

			return () => {
				parentRendered();
				return createCompiledVNode(Column, {
					items: createExpression(() => this.state.items.filter((item) => item.status === 'open'))
				});
			};
		}

		const container = document.createElement('div');
		render(createCompiledVNode(Board, {}), container);

		expect(container.textContent).toBe('1a');
		parent.state.items = [
			{ id: 'a', status: 'open' },
			{ id: 'b', status: 'open' }
		];
		flushSync();

		expect(container.textContent).toBe('2ab');
		expect(parentRendered).toHaveBeenCalledTimes(1);
		expect(childRendered).toHaveBeenCalledTimes(2);
	});

	it('keeps sibling cell DOM stable when a reactive prop updates', () => {
		let instance!: Component<{ label: string }>;
		const rendered = vi.fn();

		function Panel(this: Component<{ label: string }>) {
			instance = this;
			this.state.label = 'Alpha';
			const label = this.reactive(() => this.state.label);

			return () => {
				rendered();
				return jsx('section', {
					children: [
						jsx('span', { title: label, children: 'dynamic' }),
						jsx('strong', { children: 'stable' })
					]
				});
			};
		}

		const container = document.createElement('div');
		render(jsx(Panel, {}), container);
		const dynamic = container.querySelector('span')!;
		const stable = container.querySelector('strong')!;

		instance.state.label = 'Beta';
		flushSync();

		expect(dynamic.title).toBe('Beta');
		expect(container.querySelector('span')).toBe(dynamic);
		expect(container.querySelector('strong')).toBe(stable);
		expect(rendered).toHaveBeenCalledTimes(1);
	});

	it('updates runtime primitive props.children by rerendering the parent', () => {
		let instance!: Component<{ message: string }>;
		const parentRendered = vi.fn();
		const childRendered = vi.fn();

		function Wrapper(this: Component<{}>, props: { children?: Child | Child[] }) {
			return () => {
				childRendered();
				return jsx('section', { children: props.children });
			};
		}

		function Parent(this: Component<{ message: string }>) {
			instance = this;
			this.state.message = 'Hello';

			return () => {
				parentRendered();
				return jsx(Wrapper, { children: this.state.message });
			};
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);

		expect(container.textContent).toBe('Hello');
		instance.state.message = 'Goodbye';
		flushSync();

		expect(container.textContent).toBe('Goodbye');
		expect(parentRendered).toHaveBeenCalledTimes(2);
		expect(childRendered).toHaveBeenCalledTimes(2);
	});

	it('rerenders a wrapper when props.children structure is replaced', () => {
		let parent!: Component<{ mode: 'one' | 'two' }>;
		const parentRendered = vi.fn();
		const wrapperRendered = vi.fn();

		function One() {
			return () => jsx('span', { children: 'one' });
		}

		function Two() {
			return () => jsx('strong', { children: 'two' });
		}

		function Wrapper(this: Component<{}>, props: { children?: Child | Child[] }) {
			return () => {
				wrapperRendered();
				return jsx('section', { children: props.children });
			};
		}

		function Parent(this: Component<{ mode: 'one' | 'two' }>) {
			parent = this;
			this.state.mode = 'one';

			return () => {
				parentRendered();
				return jsx(Wrapper, {
					children: this.state.mode == 'one' ? jsx(One, {}) : jsx(Two, {})
				});
			};
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);
		expect(container.innerHTML).toContain('<span>one</span>');

		parent.state.mode = 'two';
		flushSync();

		expect(container.textContent).toBe('two');
		expect(container.querySelector('span')).toBeNull();
		expect(container.querySelectorAll('strong')).toHaveLength(1);
		expect(parentRendered).toHaveBeenCalledTimes(2);
		expect(wrapperRendered).toHaveBeenCalledTimes(2);
	});

	it('updates runtime primitive child component props by rerendering the child', () => {
		let parent!: Component<{ text: string }>;
		const childRendered = vi.fn();

		function Label(this: Component<{}>, props: { text: string }) {
			return () => {
				childRendered();
				return jsx('span', { children: props.text });
			};
		}

		function Parent(this: Component<{ text: string }>) {
			parent = this;
			this.state.text = 'Hello';
			return () => jsx(Label, { text: this.state.text });
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);

		expect(container.textContent).toBe('Hello');
		parent.state.text = 'Goodbye';
		flushSync();

		expect(container.textContent).toBe('Goodbye');
		expect(childRendered).toHaveBeenCalledTimes(2);
	});

	it('updates derived compiled object prop fields without rerendering parent or child', () => {
		let parent!: Component<{ task: { id: string; title: string } }>;
		const parentRendered = vi.fn();
		const childRendered = vi.fn();

		function CardTitle(this: Component<{}>, props: { task: { id: string; title: string } }) {
			const title = this.reactive(() => props.task.title);

			return () => {
				childRendered();
				return createCompiledVNode('span', {}, title);
			};
		}

		function Parent(this: Component<{ task: { id: string; title: string } }>) {
			parent = this;
			this.state.task = { id: 'a', title: 'First' };
			return () => {
				parentRendered();
				return createCompiledVNode(CardTitle, {
					task: createExpression(() => this.state.task)
				});
			};
		}

		const container = document.createElement('div');
		render(createCompiledVNode(Parent, {}), container);
		const span = container.querySelector('span')!;

		parent.state.task = { id: 'a', title: 'Second' };
		flushSync();

		expect(container.querySelector('span')).toBe(span);
		expect(container.textContent).toBe('Second');
		expect(parentRendered).toHaveBeenCalledTimes(1);
		expect(childRendered).toHaveBeenCalledTimes(1);
	});

	it('updates child bindings when a reactive object prop mutates in place', () => {
		let parent!: Component<{ task: { id: string; title: string } }>;
		const parentRendered = vi.fn();
		const childRendered = vi.fn();

		function CardTitle(this: Component<{}>, props: { task: { id: string; title: string } }) {
			const title = this.reactive(() => props.task.title);

			return () => {
				childRendered();
				return createCompiledVNode('span', {}, title);
			};
		}

		function Parent(this: Component<{ task: { id: string; title: string } }>) {
			parent = this;
			this.state.task = { id: 'a', title: 'First' };
			return () => {
				parentRendered();
				return createCompiledVNode(CardTitle, {
					task: createExpression(() => this.state.task)
				});
			};
		}

		const container = document.createElement('div');
		render(createCompiledVNode(Parent, {}), container);
		const span = container.querySelector('span')!;

		parent.state.task.title = 'Second';
		flushSync();

		expect(container.querySelector('span')).toBe(span);
		expect(container.textContent).toBe('Second');
		expect(parentRendered).toHaveBeenCalledTimes(1);
		expect(childRendered).toHaveBeenCalledTimes(1);
	});

	it('rerenders a child component when updated props drive control flow', () => {
		let parent!: Component<{ mode: 'compact' | 'full' }>;
		const childRendered = vi.fn();

		function Panel(this: Component<{}>, props: { mode: 'compact' | 'full' }) {
			return () => {
				childRendered();
				return props.mode == 'compact'
					? jsx('span', { children: 'Compact' })
					: jsx('strong', { children: 'Full' });
			};
		}

		function Parent(this: Component<{ mode: 'compact' | 'full' }>) {
			parent = this;
			this.state.mode = 'compact';
			return () => jsx(Panel, { mode: this.state.mode });
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);
		const panelNode = container.firstChild;
		expect(container.textContent).toBe('Compact');

		parent.state.mode = 'full';
		flushSync();

		expect(container.textContent).toBe('Full');
		expect(container.querySelector('strong')).toBeTruthy();
		expect(childRendered).toHaveBeenCalledTimes(2);
		expect(container.firstChild).toBe(panelNode);
	});

	it('does not run stale compiled component prop bindings before dynamic branch replacement', () => {
		let parent!: Component<{ selected?: { id: string; title: string } }>;

		function Detail(this: Component<{}>, props: { task: { id: string; title: string } }) {
			return () =>
				createCompiledVNode(
					'strong',
					{},
					createExpression(() => props.task.title)
				);
		}

		function Empty() {
			return () => createCompiledVNode('span', {}, 'empty');
		}

		function Parent(this: Component<{ selected?: { id: string; title: string } }>) {
			parent = this;
			this.state.selected = { id: 'a', title: 'Alpha' };

			return () =>
				createCompiledVNode(
					'section',
					{},
					createDynamicChild(() =>
						this.state.selected
							? createCompiledVNode(Detail, {
									key: this.state.selected.id,
									task: createExpression(() => this.state.selected as { id: string; title: string })
								})
							: createCompiledVNode(Empty, {})
					)
				);
		}

		const container = document.createElement('div');
		render(createCompiledVNode(Parent, {}), container);

		parent.state.selected = undefined;
		flushSync();

		expect(container.textContent).toBe('empty');
	});
});
