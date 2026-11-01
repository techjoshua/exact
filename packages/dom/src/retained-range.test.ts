/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/refs';
import { createPortal, createRef, type Component } from '@exactjs/core';
import { jsx } from './test-support/native-operations.js';
import { describe, expect, it, vi } from 'vitest';
import { unmount } from './index.js';
import { renderTestTree as render } from './testing.js';
import { roots } from './state.js';
import { createEffectScope, registerEffectScopeCleanup } from '@exactjs/reactive/framework/runtime';
import { releaseCreatedAdoptionEndpoints } from './renderer/teardown.js';
import { detachMountedRanges, restoreMountedRanges } from './renderer/retained-range.js';

describe('@exactjs/dom retained mounted ranges', () => {
	it('releases exact created endpoints while retaining authored empty text whitespace and comments', () => {
		const container = document.createElement('div');
		render(jsx('section', { children: 'Authored' }), container);
		const root = roots.get(container)!;
		const owner = root.mounted!;
		const scope = createEffectScope(owner.scope);
		const host = container.querySelector('section')!;
		const start = document.createTextNode('');
		const end = document.createTextNode('');
		const empty = document.createTextNode('');
		const whitespace = document.createTextNode(' \n ');
		const comment = document.createComment('authored wrapper');
		host.append(start, empty, whitespace, comment, end);
		registerEffectScopeCleanup(scope, () =>
			releaseCreatedAdoptionEndpoints(root, owner, start, end)
		);
		try {
			scope.stop();
			expect(start.parentNode).toBeNull();
			expect(end.parentNode).toBeNull();
			expect(Array.from(host.childNodes).slice(1)).toEqual([empty, whitespace, comment]);
			expect(empty.data).toBe('');
			expect(whitespace.data).toBe(' \n ');
			expect(comment.data).toBe('authored wrapper');
			releaseCreatedAdoptionEndpoints(root, owner, start, end);
			expect(Array.from(host.childNodes).slice(1)).toEqual([empty, whitespace, comment]);
		} finally {
			scope.stop();
			unmount(container);
		}
	});

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
		let clicks = 0;

		function Panel() {
			return () =>
				jsx('main', {
					children: [
						jsx('span', { children: 'local' }),
						createPortal(portal, jsx('button', { children: 'portal', onClick: () => clicks++ }))
					]
				});
		}

		render(jsx(Panel, {}), container);
		const root = roots.get(container)!;
		const component = root.mounted!.children[0]!;
		const button = portal.querySelector('button')!;
		button.click();
		const retained = detachMountedRanges(component.children);

		expect(container.querySelector('main')).toBeNull();
		expect(portal.querySelector('button')).toBeNull();

		restoreMountedRanges(root, retained);
		expect(container.textContent).toBe('local');
		expect(portal.querySelector('button')).toBe(button);
		button.click();
		expect(clicks).toBe(2);

		unmount(container);
		container.remove();
		portal.remove();
	});
});
