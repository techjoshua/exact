/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/refs';
import { type Component } from '@exactjs/core';
import { createDynamicChild } from '@exactjs/core/runtime/render';
import { createCompiledOperation, jsx } from './test-support/native-operations.js';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { adoptMarkerlessComponentRoot } from './test-support/adoption.js';
import { unmount } from './index.js';
import { renderTestTree as render } from './testing.js';
import {
	ConditionalRefSubtree,
	ConditionalTextBinding,
	AdoptedButton,
	compiledButtonRef,
	conditionalRefSubtreeInstance,
	conditionalTextBindingInstance
} from './bindings.fixtures.js';

describe('@exactjs/dom bindings', () => {
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
				return createCompiledOperation(
					'section',
					{},
					createDynamicChild(() =>
						this.state.mode == 'span'
							? createCompiledOperation('span', {}, 'Span')
							: createCompiledOperation('strong', {}, 'Strong')
					)
				);
			};
		}

		const container = document.createElement('div');
		render(createCompiledOperation(Panel, {}), container);
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

	it('skips dynamic reconciliation when a dependency preserves the normalized output', () => {
		let instance!: Component<{ count: number }>;
		const events: Array<{ message: string }> = [];

		function Counter(this: Component<{ count: number }>) {
			instance = this;
			this.state.count = 1;
			return () =>
				createCompiledOperation(
					'p',
					{},
					createDynamicChild(() => (this.state.count > 0 ? 'positive' : 'nonpositive'))
				);
		}

		const container = document.createElement('div');
		render(createCompiledOperation(Counter, {}), container, {
			logger: {
				isEnabled: (level) => level === 'trace',
				log: (event) => events.push(event)
			}
		});
		events.length = 0;

		instance.state.count = 2;
		flushSync();

		expect(container.textContent).toBe('positive');
		expect(events.filter((event) => event.message === 'patch children')).toHaveLength(0);
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

	it('replaces compiled text bindings when a conditional changes sources', () => {
		const container = document.createElement('div');
		render(createCompiledOperation(ConditionalTextBinding, {}), container);
		const parent = conditionalTextBindingInstance();
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
		const container = document.createElement('div');
		render(createCompiledOperation(ConditionalRefSubtree, {}), container);
		const parent = conditionalRefSubtreeInstance();
		expect(parent.refs.get(compiledButtonRef)).toBe(container.querySelector('button'));

		parent.state.mode = 'input';
		flushSync();

		expect(container.querySelector('button')).toBeNull();
		expect(container.querySelector('input')).toBeTruthy();
		expect(parent.refs.get(compiledButtonRef)).toBeUndefined();
	});

	it('disposes an adopted SSR root and its attached bindings', () => {
		const container = document.createElement('div');
		container.innerHTML = '<button>server</button>';
		const serverButton = container.querySelector('button')!;
		const clicked = vi.fn();

		expect(
			adoptMarkerlessComponentRoot(createCompiledOperation(AdoptedButton, { clicked }), container)
		).toBe(true);
		serverButton.click();
		expect(clicked).toHaveBeenCalledTimes(1);

		expect(unmount(container)).toBe(true);
		expect(container.childNodes).toHaveLength(0);
		serverButton.click();
		expect(clicked).toHaveBeenCalledTimes(1);
	});
});
