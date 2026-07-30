/**
 * @vitest-environment jsdom
 */
import { createDynamicChild, createRef, unsafeHtml, type Component } from '@exactjs/core';
import { jsx, jsxs } from '@exactjs/jsx';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { render } from './index.js';

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
		let instance!: Component<{ compact: boolean }>;

		function Box(this: Component<{ compact: boolean }>) {
			instance = this;
			this.state.compact = true;

			return () =>
				jsx('div', {
					style:
						this.state.compact == true ? { color: 'red', paddingTop: '4px' } : { color: 'blue' }
				});
		}

		const container = document.createElement('div');
		render(jsx(Box, {}), container);
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
			(this as any).task(({ signal }: { signal: AbortSignal }) => {
				signal.addEventListener('abort', () => aborted.push(String(props.id)));
			});
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
		let parent!: Component<{ show: boolean; items: { id: string; label: string }[] }>;

		function Parent(this: Component<{ show: boolean; items: { id: string; label: string }[] }>) {
			parent = this;
			this.state.show = true;
			this.state.items = [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' }
			];

			return () =>
				this.state.show == true
					? jsx('section', {
							children: this.map(
								this.state.items,
								(item) => item.id,
								(item) => jsx('span', { children: item.label })
							)
						})
					: jsx('section', { children: 'empty' });
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);
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
		let parent!: Component<{ show: boolean; label: string }>;

		function Parent(this: Component<{ show: boolean; label: string }>) {
			parent = this;
			this.state.show = true;
			this.state.label = 'visible';

			return () =>
				this.state.show == true
					? jsx('section', {
							children: createDynamicChild(() => jsx('span', { children: this.state.label }))
						})
					: jsx('section', { children: 'hidden' });
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);
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
		let parent!: Component<{ show: boolean; color: string }>;

		function Parent(this: Component<{ show: boolean; color: string }>) {
			parent = this;
			this.state.show = true;
			this.state.color = 'red';

			return () =>
				this.state.show == true
					? jsx('section', {
							children: jsx('span', {
								style: { color: this.state.color },
								children: 'styled'
							})
						})
					: jsx('section', { children: 'gone' });
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);
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
		let parent!: Component<{ show: boolean; label: string }>;

		function Parent(this: Component<{ show: boolean; label: string }>) {
			parent = this;
			this.state.show = true;
			this.state.label = 'ready';

			return () =>
				this.state.show == true
					? jsx('section', {
							children: jsx('button', {
								title: this.state.label,
								children: 'Action'
							})
						})
					: jsx('section', { children: 'gone' });
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);
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
		let parent!: Component<{ show: boolean; label: string }>;

		function Parent(this: Component<{ show: boolean; label: string }>) {
			parent = this;
			this.state.show = true;
			this.state.label = 'ready';

			return () =>
				this.state.show == true
					? jsx('section', {
							children: jsx('span', { children: this.state.label })
						})
					: jsx('section', { children: 'gone' });
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);
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
