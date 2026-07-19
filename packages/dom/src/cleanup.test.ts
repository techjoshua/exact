/**
 * @vitest-environment jsdom
 */
import { createRef, type Component } from '@exact/core';
import { jsx } from '@exact/jsx';
import { flushSync } from '@exact/reactive';
import { describe, expect, it, vi } from 'vitest';
import { render, unmount } from './index.js';

describe('@exact/dom cleanup', () => {
	it('clears refs when DOM nodes are replaced', () => {
		const buttonRef = createRef<HTMLButtonElement>('button');
		let parent!: Component<{ mode: 'button' | 'input' }>;

		function Parent(this: Component<{ mode: 'button' | 'input' }>) {
			parent = this;
			this.state.mode = 'button';

			return () =>
				this.state.mode == 'button'
					? jsx('button', { ref: this.ref(buttonRef), children: 'Save' })
					: jsx('input', { value: 'Saved' });
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);
		expect(parent.refs.get(buttonRef)).toBe(container.querySelector('button'));

		parent.state.mode = 'input';
		flushSync();

		expect(container.querySelector('button')).toBeNull();
		expect(container.querySelector('input')).toBeTruthy();
		expect(parent.refs.get(buttonRef)).toBeUndefined();
	});

	it('explicitly disposes a root and all of its renderer-owned resources', () => {
		const unmounted = vi.fn();
		const clicked = vi.fn();
		const ref = createRef<HTMLButtonElement>('root-button');
		let component!: Component<{ count: number }>;

		function App(this: Component<{ count: number }>) {
			component = this;
			this.state.count = 0;
			this.onUnmount(unmounted);
			return () =>
				jsx('button', {
					ref: this.ref(ref),
					onClick: clicked,
					children: String(this.state.count)
				});
		}

		const container = document.createElement('div');
		render(jsx(App, {}), container);
		const button = container.querySelector('button')!;
		button.click();
		expect(clicked).toHaveBeenCalledTimes(1);
		expect(component.refs.get(ref)).toBe(button);

		expect(unmount(container)).toBe(true);
		expect(container.childNodes).toHaveLength(0);
		expect(unmounted).toHaveBeenCalledTimes(1);
		expect(component.refs.get(ref)).toBeUndefined();
		expect(unmount(container)).toBe(false);

		button.click();
		expect(clicked).toHaveBeenCalledTimes(1);
		component.state.count++;
		flushSync();
		expect(button.textContent).toBe('0');
	});

	it('does not leave orphan DOM when nested components are replaced', () => {
		let parent!: Component<{ mode: 'one' | 'two' }>;

		function One() {
			return () => jsx('span', { children: 'one' });
		}

		function Two() {
			return () => jsx('strong', { children: 'two' });
		}

		function Parent(this: Component<{ mode: 'one' | 'two' }>) {
			parent = this;
			this.state.mode = 'one';

			return () =>
				this.state.mode == 'one'
					? jsx('section', { children: jsx(One, {}) })
					: jsx('section', { children: jsx(Two, {}) });
		}

		const container = document.createElement('div');
		render(jsx(Parent, {}), container);
		expect(container.innerHTML).toContain('<span>one</span>');

		parent.state.mode = 'two';
		flushSync();

		expect(container.textContent).toBe('two');
		expect(container.querySelector('span')).toBeNull();
		expect(container.querySelectorAll('strong')).toHaveLength(1);
	});
});
