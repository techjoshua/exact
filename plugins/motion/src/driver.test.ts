import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MotionDriver } from './contracts.js';
import { createWebAnimationDriver, installMotionDriver, motionDriver } from './driver.js';

const driver = (_name: string): MotionDriver => ({
	play: vi.fn(async () => undefined)
});

afterEach(() => vi.unstubAllGlobals());

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

	it('continues the next browser animation from the interrupted computed frame', async () => {
		let rejectFirst!: (error: unknown) => void;
		const firstFinished = new Promise<void>((_resolve, reject) => {
			rejectFirst = reject;
		});
		const firstAnimation = {
			finished: firstFinished,
			cancel: vi.fn(() => rejectFirst(new Error('cancelled')))
		};
		const secondAnimation = { finished: Promise.resolve(), cancel: vi.fn() };
		const animate = vi
			.fn()
			.mockReturnValueOnce(firstAnimation)
			.mockReturnValueOnce(secondAnimation);
		const element = { animate } as unknown as Element;
		vi.stubGlobal('getComputedStyle', () => ({
			getPropertyValue(property: string) {
				return property === 'opacity' ? '0.4' : '';
			}
		}));
		const browser = createWebAnimationDriver();
		const abort = new AbortController();
		const interrupted = browser.play(
			element,
			{ keyframes: [{ opacity: 1 }, { opacity: 0 }] },
			abort.signal
		);
		abort.abort('reverse');
		await expect(interrupted).rejects.toBe('reverse');

		await browser.play(
			element,
			{ keyframes: [{ opacity: 0 }, { opacity: 1 }] },
			new AbortController().signal
		);
		expect(animate).toHaveBeenCalledTimes(2);
		expect(animate.mock.calls[1]?.[0]).toEqual([{ opacity: '0.4' }, { opacity: 1 }]);
	});
});
