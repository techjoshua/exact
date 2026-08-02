import { describe, expect, it, vi } from 'vitest';
import type { MotionDriver } from './contracts.js';
import { installMotionDriver, motionDriver } from './driver.js';

const driver = (_name: string): MotionDriver => ({
	play: vi.fn(async () => undefined)
});

describe('motion driver installation', () => {
	it('restores active leases correctly after out-of-order application disposal', () => {
		const first = driver('first');
		const second = driver('second');
		const third = driver('third');
		const restoreFirst = installMotionDriver(first);
		const restoreSecond = installMotionDriver(second);
		const restoreThird = installMotionDriver(third);
		expect(motionDriver()).toBe(third);

		restoreSecond();
		expect(motionDriver()).toBe(third);
		restoreThird();
		expect(motionDriver()).toBe(first);
		restoreFirst();
		expect(motionDriver()).not.toBe(first);
	});

	it('makes each restore lease idempotent', () => {
		const installed = driver('installed');
		const restore = installMotionDriver(installed);
		restore();
		restore();
		expect(motionDriver()).not.toBe(installed);
	});
});
