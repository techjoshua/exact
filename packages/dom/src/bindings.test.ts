/**
 * @vitest-environment jsdom
 */
import {
	createCompiledVNode,
	createDynamicChild,
	createRef,
	createVNode,
	type Component
} from '@exact/core';
import { jsx } from '@exact/jsx';
import { flushSync } from '@exact/reactive';
import { describe, expect, it, vi } from 'vitest';
import { adoptStatic, render, unmount } from './index.js';

describe('@exact/dom bindings', () => {
	it('updates reactive text compositions without rerendering the component', () => {
		let instance!: Component<{ first: string; last: string }>;
		const rendered = vi.fn();

		function Person(this: Component<{ first: string; last: string }>) {
			instance = this;
			this.state.first = 'Ada';
			this.state.last = 'Lovelace';
			const fullName = this.reactive(() => `${this.state.first} ${this.state.last}`);

			return () => {
				rendered();
				return jsx('span', { children: fullName });
			};
		}

		const container = document.createElement('div');
		render(jsx(Person, {}), container);
		expect(container.textContent).toBe('Ada Lovelace');

		instance.state.last = 'Byron';
		flushSync();

		expect(container.textContent).toBe('Ada Byron');
		expect(rendered).toHaveBeenCalledTimes(1);
	});

	it('patches compiled dynamic child branches at their own boundary', () => {
		let instance!: Component<{ mode: 'span' | 'strong' }>;
		const rendered = vi.fn();

		function Panel(this: Component<{ mode: 'span' | 'strong' }>) {
			instance = this;
			this.state.mode = 'span';

			return () => {
				rendered();
				return createCompiledVNode(
					'section',
					{},
					createDynamicChild(() =>
						this.state.mode == 'span'
							? createCompiledVNode('span', {}, 'Span')
							: createCompiledVNode('strong', {}, 'Strong')
					)
				);
			};
		}

		const container = document.createElement('div');
		render(createCompiledVNode(Panel, {}), container);
		const section = container.querySelector('section')!;

		expect(section.textContent).toBe('Span');
		expect(section.querySelector('span')).toBeTruthy();

		instance.state.mode = 'strong';
		flushSync();

		expect(container.querySelector('section')).toBe(section);
		expect(section.querySelector('span')).toBeNull();
		expect(section.querySelector('strong')).toBeTruthy();
		expect(section.textContent).toBe('Strong');
		expect(rendered).toHaveBeenCalledTimes(1);
	});

	it('does not update reactive DOM bindings for structurally identical reloads', () => {
		let instance!: Component<{ user: { name: string; roles: string[] } }>;
		const rendered = vi.fn();
		const titleWrites: string[] = [];

		function Person(this: Component<{ user: { name: string; roles: string[] } }>) {
			instance = this;
			this.state.user = { name: 'Ada', roles: ['admin'] };
			const title = this.reactive(() => this.state.user.name);

			return () => {
				rendered();
				return jsx('span', { title, children: 'name' });
			};
		}

		const container = document.createElement('div');
		render(jsx(Person, {}), container);
		const span = container.querySelector('span')!;
		const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'title')!;
		Object.defineProperty(span, 'title', {
			get() {
				return descriptor.get?.call(this);
			},
			set(value: string) {
				titleWrites.push(value);
				descriptor.set?.call(this, value);
			},
			configurable: true
		});

		instance.state.user = { name: 'Ada', roles: ['admin'] };
		flushSync();
		instance.state.user = { name: 'Grace', roles: ['admin'] };
		flushSync();

		expect(span.title).toBe('Grace');
		expect(titleWrites).toEqual(['Grace']);
		expect(rendered).toHaveBeenCalledTimes(1);
	});

	it('replaces text bindings when a text vnode changes sources', () => {
		let parent!: Component<{ useA: boolean; a: string; b: string }>;

		function Parent(this: Component<{ useA: boolean; a: string; b: string }>) {
			parent = this;
			this.state.useA = true;
			this.state.a = 'A';
			this.state.b = 'B';

			return () =>
				jsx('span', {
					children: this.state.useA == true ? this.state.a : this.state.b
				});
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);
		expect(container.textContent).toBe('A');

		parent.state.useA = false;
		flushSync();
		expect(container.textContent).toBe('B');

		parent.state.a = 'old';
		flushSync();
		expect(container.textContent).toBe('B');

		parent.state.b = 'new';
		flushSync();
		expect(container.textContent).toBe('new');
	});

	it('clears refs when compiled cell subtrees are replaced', () => {
		const buttonRef = createRef<HTMLButtonElement>('compiled-button');
		let parent!: Component<{ mode: 'button' | 'input' }>;

		function Parent(this: Component<{ mode: 'button' | 'input' }>) {
			parent = this;
			this.state.mode = 'button';

			return () =>
				createCompiledVNode(
					'section',
					{},
					this.state.mode == 'button'
						? createCompiledVNode('button', { ref: this.ref(buttonRef) }, 'Save')
						: createCompiledVNode('input', { value: 'Saved' })
				);
		}

		const container = document.createElement('div');
		render(createCompiledVNode(Parent, {}), container);
		expect(parent.refs.get(buttonRef)).toBe(container.querySelector('button'));

		parent.state.mode = 'input';
		flushSync();

		expect(container.querySelector('button')).toBeNull();
		expect(container.querySelector('input')).toBeTruthy();
		expect(parent.refs.get(buttonRef)).toBeUndefined();
	});

	it('disposes an adopted SSR root and its attached bindings', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<!--exact:component:0--><button>server</button><!--/exact:component:0-->';
		const serverButton = container.querySelector('button')!;
		const clicked = vi.fn();

		expect(adoptStatic(createVNode('button', { onClick: clicked }, 'server'), container)).toBe(
			true
		);
		serverButton.click();
		expect(clicked).toHaveBeenCalledTimes(1);

		expect(unmount(container)).toBe(true);
		expect(container.childNodes).toHaveLength(0);
		serverButton.click();
		expect(clicked).toHaveBeenCalledTimes(1);
	});
});
