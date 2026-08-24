/**
 * @vitest-environment jsdom
 */
import type { Component } from '@exactjs/core';
import { describe, expect, it, vi } from 'vitest';
import { render } from './index.js';
import { jsx } from './test-support/native-vnode.js';

describe('@exactjs/dom task-free events', () => {
	it('runs a component library event without a durable task owner', () => {
		const container = document.createElement('div');
		const handler = vi.fn();
		function LibraryButton(this: Component<{}>) {
			return () => jsx('button', { onClick: handler, children: 'Toggle' });
		}

		render(jsx(LibraryButton, {}), container);
		container.querySelector('button')!.click();

		expect(handler).toHaveBeenCalledOnce();
	});
});
