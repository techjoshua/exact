/**
 * @vitest-environment jsdom
 */
import { createVNode } from '@exactjs/core';
import { describe, expect, it, vi } from 'vitest';
import { render, unmount } from './index.js';

describe('failure-complete DOM teardown', () => {
	it('removes the complete owned DOM after a ref teardown failure', () => {
		const later = vi.fn();
		const failingRef = {
			fulfill(value: unknown) {
				if (value === undefined) throw new Error('ref cleanup failed');
			}
		};
		const container = document.createElement('div');
		render(
			createVNode(
				'section',
				null,
				createVNode('span', { ref: failingRef }, 'first'),
				createVNode('span', { ref: { fulfill: later } }, 'second')
			),
			container
		);

		expect(() => unmount(container)).toThrow('ref cleanup failed');
		expect(container.childNodes).toHaveLength(0);
		expect(later).toHaveBeenLastCalledWith(undefined);
		expect(unmount(container)).toBe(false);
	});
});
