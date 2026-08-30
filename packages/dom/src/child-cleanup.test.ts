/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/lists';
import '@exactjs/core/runtime/refs';
import {
	activateTaskForHost,
	createRef,
	defineTask,
	unsafeHtml,
	type Component
} from '@exactjs/core';
import { createExpression } from '@exactjs/core/runtime/render';
import './unsafe-html.js';
import { jsx, jsxs } from './test-support/native-operations.js';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { renderTestTree as render } from './testing.js';
import {
	DynamicBranchCleanup,
	ListBranchCleanup,
	PropBranchCleanup,
	StyleBranchCleanup,
	StyleObjectCleanup,
	TextBranchCleanup,
	dynamicBranchCleanupInstance,
	listBranchCleanupInstance,
	propBranchCleanupInstance,
	styleBranchCleanupInstance,
	styleObjectCleanupInstance,
	textBranchCleanupInstance
} from './child-cleanup.fixtures.js';

describe('@exactjs/dom child-cleanup', () => {
	it('rolls back earlier child ownership when a later child cannot mount', () => {
		const released = vi.fn();
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		function Owned(this: Component<{}>) {
			this.onUnmount(released);
			return () => jsx('span', { children: 'provisional' });
		}

		function Parent() {
			return () => [jsx(Owned, {}), unsafeHtml('<strong>not allowed</strong>')];
		}

		try {
			const container = document.createElement('div');
			render(jsx(Parent, {}), container);

			expect(released).toHaveBeenCalledTimes(1);
			expect(container.textContent).not.toContain('provisional');
		} finally {
			errorLog.mockRestore();
		}
	});

	it('removes replaced style object properties', () => {
		const container = document.createElement('div');
		render(jsx(StyleObjectCleanup, {}), container);
		const instance = styleObjectCleanupInstance();
		const box = container.querySelector('div')!;
		expect(box.style.color).toBe('red');
		expect(box.style.paddingTop).toBe('4px');

		instance.state.compact = false;
		flushSync();

		expect(box.style.color).toBe('blue');
		expect(box.style.paddingTop).toBe('');
	});

	it('removes a keyed child without rerendering the parent', () => {
		let instance!: Component<{ items: { id: string; label: string }[] }>;
		const rendered = vi.fn();

		function List(this: Component<{ items: { id: string; label: string }[] }>) {
			instance = this;
			this.state.items = [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' },
				{ id: 'c', label: 'C' }
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
		const removed = container.querySelectorAll('li')[1];

		instance.state.items = [
			{ id: 'a', label: 'A' },
			{ id: 'c', label: 'C' }
		];
		flushSync();

		expect(Array.from(container.querySelectorAll('li')).map((item) => item.textContent)).toEqual([
			'A',
			'C'
		]);
		expect(Array.from(container.querySelectorAll('li'))).not.toContain(removed);
		expect(rendered).toHaveBeenCalledTimes(1);
	});

	it('unmounts keyed child components and aborts their tasks on removal', () => {
		let list!: Component<{ items: { id: string }[] }>;
		const unmounted: string[] = [];
		const aborted: string[] = [];

		function Row(this: Component<{}>, props: { id: string }) {
			this.onUnmount(() => unmounted.push(String(props.id)));
			activateTaskForHost(
				this,
				defineTask({}, ({ signal }) => {
					signal.addEventListener('abort', () => aborted.push(String(props.id)));
				})
			);
			return () => jsx('li', { children: props.id });
		}

		function List(this: Component<{ items: { id: string }[] }>) {
			list = this;
			this.state.items = [{ id: 'a' }, { id: 'b' }];

			return () =>
				jsx('ul', {
					children: this.map(
						this.state.items,
						(item) => item.id,
						(item) => jsx(Row, { id: item.id })
					)
				});
		}

		const container = document.createElement('div');
		render(jsx(List, {}), container);

		list.state.items = [{ id: 'a' }];
		flushSync();

		expect(container.textContent).toBe('a');
		expect(unmounted).toEqual(['b']);
		expect(aborted).toEqual(['b']);
	});

	it('stops removed list fragment watchers', () => {
		const container = document.createElement('div');
		render(jsx(ListBranchCleanup, {}), container);
		const parent = listBranchCleanupInstance();
		expect(container.textContent).toBe('AB');

		parent.state.show = false;
		flushSync();
		expect(container.textContent).toBe('empty');

		parent.state.items = [{ id: 'c', label: 'C' }];
		flushSync();
		expect(container.textContent).toBe('empty');
		expect(container.querySelectorAll('span')).toHaveLength(0);
	});

	it('stops removed dynamic child watchers', () => {
		const container = document.createElement('div');
		render(jsx(DynamicBranchCleanup, {}), container);
		const parent = dynamicBranchCleanupInstance();
		const removedSpan = container.querySelector('span')!;

		parent.state.show = false;
		flushSync();
		parent.state.label = 'changed';
		flushSync();

		expect(container.textContent).toBe('hidden');
		expect(container.querySelector('span')).toBeNull();
		expect(removedSpan.isConnected).toBe(false);
	});

	it('stops reactive style watchers when DOM nodes are removed', () => {
		const container = document.createElement('div');
		render(jsx(StyleBranchCleanup, {}), container);
		const parent = styleBranchCleanupInstance();
		const removedSpan = container.querySelector('span')!;
		expect(removedSpan.style.color).toBe('red');

		parent.state.show = false;
		flushSync();
		parent.state.color = 'blue';
		flushSync();

		expect(container.textContent).toBe('gone');
		expect(removedSpan.isConnected).toBe(false);
		expect(removedSpan.style.color).toBe('red');
	});

	it('stops reactive prop watchers when DOM nodes are removed', () => {
		const container = document.createElement('div');
		render(jsx(PropBranchCleanup, {}), container);
		const parent = propBranchCleanupInstance();
		const removedButton = container.querySelector('button')!;
		expect(removedButton.title).toBe('ready');

		parent.state.show = false;
		flushSync();
		parent.state.label = 'stale';
		flushSync();

		expect(container.textContent).toBe('gone');
		expect(removedButton.isConnected).toBe(false);
		expect(removedButton.title).toBe('ready');
	});

	it('stops reactive text watchers when text nodes are removed', () => {
		const container = document.createElement('div');
		render(jsx(TextBranchCleanup, {}), container);
		const parent = textBranchCleanupInstance();
		const removedText = container.querySelector('span')!.firstChild as CharacterData;
		expect(removedText.data).toBe('ready');

		parent.state.show = false;
		flushSync();
		parent.state.label = 'stale';
		flushSync();

		expect(container.textContent).toBe('gone');
		expect(removedText.isConnected).toBe(false);
		expect(removedText.data).toBe('ready');
	});

	it('clears refs when keyed DOM nodes are removed', () => {
		const itemRef = createRef<HTMLLIElement>('item');
		let list!: Component<{ items: { id: string }[] }>;

		function List(this: Component<{ items: { id: string }[] }>) {
			list = this;
			this.state.items = [{ id: 'a' }];

			return () =>
				jsx('ul', {
					children: this.map(
						this.state.items,
						(item) => item.id,
						(item) => jsx('li', { ref: this.ref(itemRef), children: item.id })
					)
				});
		}

		const container = document.createElement('div');
		render(jsx(List, {}), container);
		expect(list.refs.get(itemRef)).toBe(container.querySelector('li'));

		list.state.items = [];
		flushSync();

		expect(container.querySelector('li')).toBeNull();
		expect(list.refs.get(itemRef)).toBeUndefined();
	});

	it('stops compiler-created keyed item expressions when their row is removed', () => {
		let list!: Component<{ items: { id: string }[]; suffix: string }>;
		let itemLabel!: { get(): string };

		function List(this: Component<{ items: { id: string }[]; suffix: string }>) {
			list = this;
			this.state.items = [{ id: 'a' }];
			this.state.suffix = 'first';
			return () =>
				jsx('ul', {
					children: this.map(
						this.state.items,
						(item) => item.id,
						(item) => {
							itemLabel = createExpression(() => `${item.id}:${this.state.suffix}`);
							return jsx('li', { children: itemLabel });
						}
					)
				});
		}

		const container = document.createElement('div');
		render(jsx(List, {}), container);
		expect(container.textContent).toBe('a:first');
		list.state.items = [];
		flushSync();
		list.state.suffix = 'second';
		flushSync();
		expect(itemLabel.get()).toBe('a:first');
	});

	it('unmounts and removes the previous root when rendering a new root', () => {
		const unmounted = vi.fn();

		function First(this: Component<{}>) {
			this.onUnmount(unmounted);
			return () => jsx('section', { children: jsx('span', { children: 'first' }) });
		}

		function Second() {
			return () => jsx('article', { children: 'second' });
		}

		const container = document.createElement('div');
		render(jsx(First, {}), container);
		expect(container.textContent).toBe('first');

		render(jsx(Second, {}), container);

		expect(container.textContent).toBe('second');
		expect(container.querySelector('section')).toBeNull();
		expect(container.querySelector('article')).toBeTruthy();
		expect(unmounted).toHaveBeenCalledTimes(1);
	});
});
