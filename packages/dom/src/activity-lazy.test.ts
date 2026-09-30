/** @vitest-environment jsdom */
import { expect, it, vi } from 'vitest';
import { flushSync } from '@exactjs/reactive';
import { mountTest } from '@exactjs/testing';
import { createTestOperation as jsx } from '@exactjs/testing/internal/fixtures';
import './structural-boundaries.js';
import { LazyActivity } from './test-support/components/activity-lazy.fixtures.js';
import {
	lazyActivityOwners,
	lazyActivitySetups,
	lazyActivityUnmounts,
	releaseLazyActivity
} from './test-support/components/activity-lazy-control.js';

it('resumes lazy content resolved while parked without disturbing another root', async () => {
	const left = await mountTest(jsx(LazyActivity, { label: 'left' }), { settleTasks: false });
	let right: Awaited<ReturnType<typeof mountTest>> | undefined;
	try {
		right = await mountTest(jsx(LazyActivity, { label: 'right' }), { settleTasks: false });
		expect(left.container.textContent).toBe('loading');
		expect(right.container.textContent).toBe('loading');
		lazyActivityOwners.get('left')!.state.mode = 'parked';
		flushSync();
		releaseLazyActivity();
		await right.settle();
		await vi.waitFor(() =>
			expect(right!.container.querySelector('button')?.textContent).toBe('right:0')
		);
		const retained = right.container.querySelector('button')!;
		retained.click();
		flushSync();
		expect(retained.textContent).toBe('right:1');
		lazyActivityOwners.get('left')!.state.mode = 'active';
		flushSync();
		await left.settle();
		await vi.waitFor(() => {
			flushSync();
			expect(left.container.querySelector('button')?.textContent).toBe('left:0');
		});
		const resumed = left.container.querySelector('button')!;
		resumed.click();
		flushSync();
		expect(resumed.textContent).toBe('left:1');
		left.unmount();
		expect(right.container.querySelector('button')).toBe(retained);
		retained.click();
		flushSync();
		expect(retained.textContent).toBe('right:2');
		right.unmount();
		expect(lazyActivityUnmounts.slice(-2)).toEqual(['left', 'right']);
		expect([...lazyActivityUnmounts].sort()).toEqual([...lazyActivitySetups].sort());
	} finally {
		releaseLazyActivity();
		left.unmount();
		right?.unmount();
		lazyActivityOwners.clear();
	}
});
