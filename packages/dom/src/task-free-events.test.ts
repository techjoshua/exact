/**
 * @vitest-environment jsdom
 */
import type { Component } from '@exactjs/core';
import { describe, expect, it, vi } from 'vitest';
import { renderTestTree as render } from './testing.js';
import { jsx } from './test-support/native-operations.js';

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
