/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/lists';
import '@exactjs/core/runtime/refs';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { unmount } from './index.js';
import { renderTestTree as render } from './testing.js';
import { jsx } from './test-support/native-operations.js';
import { KeyedRoot, keyedRootState } from './test-support/roots/keyed-root.fixtures.js';

describe('keyed component-root completion', () => {
	it('publishes the final root after sibling updates and retained reordering', () => {
		const container = document.createElement('div');
		render(jsx(KeyedRoot, {}), container);
		try {
			const { owner, lifecycle } = keyedRootState();
			expect(lifecycle.current).toBe(container.querySelector('button'));
			owner.state.rows = owner.state.rows.map((item) => ({
				...item,
				label: item.label + ' updated'
			}));
			flushSync();
			const anchors = [...container.querySelectorAll('button')];
			expect(anchors.map((element) => element.textContent)).toEqual(['A updated', 'B updated']);
			expect(lifecycle.current).toBe(anchors[0]);
			owner.state.rows.reverse();
			flushSync();
			expect([...container.querySelectorAll('button')]).toEqual([anchors[1], anchors[0]]);
			expect(lifecycle.current).toBe(anchors[1]);
		} finally {
			unmount(container);
		}
	});
});
