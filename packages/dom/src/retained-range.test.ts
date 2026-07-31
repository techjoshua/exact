/**
 * @vitest-environment jsdom
 */
import { createPortal, createRef, type Component } from '@exactjs/core';
import { jsx } from './test-support/native-vnode.js';
import { describe, expect, it, vi } from 'vitest';
import { render, unmount } from './index.js';
import { roots } from './state.js';
import { detachMountedRanges, restoreMountedRanges } from './renderer/retained-range.js';

describe('@exactjs/dom retained mounted ranges', () => {
	it('preserves node, form, handler, ref, and component identity across retention', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const clicked = vi.fn();
		const inputRef = createRef<HTMLInputElement>('input');
		let panel!: Component<{}>;

		function Panel(this: Component<{}>) {
			panel = this;
			return () =>
				jsx('section', {
					children: [
						jsx('input', { ref: this.ref(inputRef), defaultValue: 'initial' }),
						jsx('button', { onClick: clicked, children: 'run' })
					]
				});
		}

		render(jsx(Panel, {}), container);
		const root = roots.get(container)!;
		const boundary = root.mounted!;
		const component = boundary.children[0]!;
		const section = container.querySelector('section')!;
		const input = container.querySelector('input')!;
		const state = panel.state;
		input.value = 'edited';

		const retained = detachMountedRanges(component.children);
		expect(container.querySelector('section')).toBeNull();
		expect(panel.refs.get(inputRef)).toBe(input);
		expect(panel.state).toBe(state);

		restoreMountedRanges(root, retained);
		expect(container.querySelector('section')).toBe(section);
		expect(container.querySelector('input')).toBe(input);
		expect(input.value).toBe('edited');
		container.querySelector('button')!.click();
		expect(clicked).toHaveBeenCalledTimes(1);

		unmount(container);
		expect(panel.refs.get(inputRef)).toBeUndefined();
		container.remove();
	});

	it('retains portal content with its logical subtree', () => {
		const container = document.createElement('div');
		const portal = document.createElement('aside');
		document.body.append(container, portal);

		function Panel() {
			return () =>
				jsx('main', {
					children: [
						jsx('span', { children: 'local' }),
						createPortal(portal, jsx('button', { children: 'portal' }))
					]
				});
		}

		render(jsx(Panel, {}), container);
		const root = roots.get(container)!;
		const component = root.mounted!.children[0]!;
		const button = portal.querySelector('button')!;
		const retained = detachMountedRanges(component.children);

		expect(container.querySelector('main')).toBeNull();
		expect(portal.querySelector('button')).toBeNull();

		restoreMountedRanges(root, retained);
		expect(container.textContent).toBe('local');
		expect(portal.querySelector('button')).toBe(button);

		unmount(container);
		container.remove();
		portal.remove();
	});
});
