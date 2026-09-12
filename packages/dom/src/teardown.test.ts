/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { unmount } from './index.js';
import { renderTestTree as render } from './testing.js';
import { createOperation } from './test-support/native-operations.js';

describe('failure-complete DOM teardown', () => {
	it('releases descendants before parents in sibling order after a cleanup failure', () => {
		const released: string[] = [];
		const ref = (name: string) => ({
			fulfill(value: unknown) {
				if (value !== undefined) return;
				released.push(name);
				if (name === 'first') throw new Error('first cleanup failed');
			}
		});
		const container = document.createElement('div');
		render(
			createOperation(
				'section',
				{ ref: ref('parent') },
				createOperation('span', { ref: ref('first') }, 'first'),
				createOperation(
					'div',
					{ ref: ref('second') },
					createOperation('span', { ref: ref('grandchild') }, 'nested')
				)
			),
			container
		);
		expect(() => unmount(container)).toThrow('first cleanup failed');
		expect(released).toEqual(['first', 'grandchild', 'second', 'parent']);
		expect(container.childNodes).toHaveLength(0);
		expect(unmount(container)).toBe(false);
	});

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
