/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/lists';
import { type Component } from '@exactjs/core';
import { createDynamicChild, createExpression } from '@exactjs/core/runtime/render';
import { createCompiledOperation, jsx } from './test-support/native-operations.js';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { renderTestTree as render } from './testing.js';
import {
	ControlFlowParent,
	FilteredPropParent,
	PrimitiveChildrenParent,
	StructuralChildrenParent,
	controlFlowParentInstance,
	filteredPropParentInstance,
	primitiveChildrenParentInstance,
	structuralChildrenParentInstance
} from './test-support/components/component-props.fixtures.js';

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
				return createCompiledOperation(
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
		render(createCompiledOperation(Label, {}), container);
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

	it('publishes a finalized compiled collection prop receipt', () => {
		const container = document.createElement('div');
		render(createCompiledOperation(FilteredPropParent, {}), container);
		const parent = filteredPropParentInstance();

		expect(container.textContent).toBe('1a');
		parent.state.items = [
			{ id: 'a', status: 'open' },
			{ id: 'b', status: 'open' }
		];
		flushSync();

		expect(container.textContent).toBe('2ab');
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

	it('publishes finalized primitive props.children values', () => {
		const container = document.createElement('div');
		render(createCompiledOperation(PrimitiveChildrenParent, {}), container);
		const instance = primitiveChildrenParentInstance();

		expect(container.textContent).toBe('Hello');
		instance.state.message = 'Goodbye';
		flushSync();

		expect(container.textContent).toBe('Goodbye');
	});

	it('replaces finalized structural props.children values', () => {
		const container = document.createElement('div');
		render(createCompiledOperation(StructuralChildrenParent, {}), container);
		const parent = structuralChildrenParentInstance();
		expect(container.innerHTML).toContain('<span>one</span>');

		parent.state.mode = 'two';
		flushSync();

		expect(container.textContent).toBe('two');
		expect(container.querySelector('span')).toBeNull();
		expect(container.querySelectorAll('strong')).toHaveLength(1);
	});

	it('updates derived compiled object prop fields without rerendering parent or child', () => {
		let parent!: Component<{ task: { id: string; title: string } }>;
		const parentRendered = vi.fn();
		const childRendered = vi.fn();

		function CardTitle(this: Component<{}>, props: { task: { id: string; title: string } }) {
			const title = this.reactive(() => props.task.title);

			return () => {
				childRendered();
				return createCompiledOperation('span', {}, title);
			};
		}

		function Parent(this: Component<{ task: { id: string; title: string } }>) {
			parent = this;
			this.state.task = { id: 'a', title: 'First' };
			return () => {
				parentRendered();
				return createCompiledOperation(CardTitle, {
					task: createExpression(() => this.state.task)
				});
			};
		}

		const container = document.createElement('div');
		render(createCompiledOperation(Parent, {}), container);
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
				return createCompiledOperation('span', {}, title);
			};
		}

		function Parent(this: Component<{ task: { id: string; title: string } }>) {
			parent = this;
			this.state.task = { id: 'a', title: 'First' };
			return () => {
				parentRendered();
				return createCompiledOperation(CardTitle, {
					task: createExpression(() => this.state.task)
				});
			};
		}

		const container = document.createElement('div');
		render(createCompiledOperation(Parent, {}), container);
		const span = container.querySelector('span')!;

		parent.state.task.title = 'Second';
		flushSync();

		expect(container.querySelector('span')).toBe(span);
		expect(container.textContent).toBe('Second');
		expect(parentRendered).toHaveBeenCalledTimes(1);
		expect(childRendered).toHaveBeenCalledTimes(1);
	});

	it('applies received props before child-local control flow', () => {
		const container = document.createElement('div');
		render(createCompiledOperation(ControlFlowParent, {}), container);
		const parent = controlFlowParentInstance();
		const panelNode = container.firstChild;
		expect(container.textContent).toBe('Compact');

		parent.state.expanded = true;
		flushSync();

		expect(container.textContent).toBe('Full');
		expect(container.querySelector('strong')).toBeTruthy();
		expect(container.firstChild).toBe(panelNode);
	});

	it('does not run stale compiled component prop bindings before dynamic branch replacement', () => {
		let parent!: Component<{ selected?: { id: string; title: string } }>;

		function Detail(this: Component<{}>, props: { task: { id: string; title: string } }) {
			return () =>
				createCompiledOperation(
					'strong',
					{},
					createExpression(() => props.task.title)
				);
		}

		function Empty() {
			return () => createCompiledOperation('span', {}, 'empty');
		}

		function Parent(this: Component<{ selected?: { id: string; title: string } }>) {
			parent = this;
			this.state.selected = { id: 'a', title: 'Alpha' };

			return () =>
				createCompiledOperation(
					'section',
					{},
					createDynamicChild(() =>
						this.state.selected
							? createCompiledOperation(Detail, {
									key: this.state.selected.id,
									task: createExpression(() => this.state.selected as { id: string; title: string })
								})
							: createCompiledOperation(Empty, {})
					)
				);
		}

		const container = document.createElement('div');
		render(createCompiledOperation(Parent, {}), container);

		parent.state.selected = undefined;
		flushSync();

		expect(container.textContent).toBe('empty');
	});
});
