/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { unmount } from './index.js';
import { renderTestTree as render } from './testing.js';
import { createOperation } from './test-support/native-operations.js';

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
			createOperation(
				'section',
				null,
				createOperation('span', { ref: failingRef }, 'first'),
				createOperation('span', { ref: { fulfill: later } }, 'second')
			),
			container
		);

		expect(() => unmount(container)).toThrow('ref cleanup failed');
		expect(container.childNodes).toHaveLength(0);
		expect(later).toHaveBeenLastCalledWith(undefined);
		expect(unmount(container)).toBe(false);
	});
});
