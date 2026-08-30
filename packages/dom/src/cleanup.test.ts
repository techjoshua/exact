/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/refs';
import { createRef, type Component } from '@exactjs/core';
import { jsx } from './test-support/native-operations.js';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { unmount } from './index.js';
import { renderTestTree as render } from './testing.js';
import {
	CleanupSwitch,
	NestedCleanupSwitch,
	cleanupButtonRef,
	cleanupSwitchInstance,
	nestedCleanupSwitchInstance
} from './dom-behavior.fixtures.js';

describe('@exactjs/dom cleanup', () => {
	it('clears refs when DOM nodes are replaced', () => {
		const container = document.createElement('div');
		render(jsx(CleanupSwitch, {}), container);
		const parent = cleanupSwitchInstance();
		expect(parent.refs.get(cleanupButtonRef)).toBe(container.querySelector('button'));

		parent.state.mode = 'input';
		flushSync();

		expect(container.querySelector('button')).toBeNull();
		expect(container.querySelector('input')).toBeTruthy();
		expect(parent.refs.get(cleanupButtonRef)).toBeUndefined();
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
		const container = document.createElement('div');
		render(jsx(NestedCleanupSwitch, {}), container);
		const parent = nestedCleanupSwitchInstance();
		expect(container.innerHTML).toContain('<span>one</span>');

		parent.state.mode = 'two';
		flushSync();

		expect(container.textContent).toBe('two');
		expect(container.querySelector('span')).toBeNull();
		expect(container.querySelectorAll('strong')).toHaveLength(1);
	});
});
