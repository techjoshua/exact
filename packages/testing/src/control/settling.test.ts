import { expect, it, vi } from 'vitest';
import { withTimeout } from './settling.js';

it('releases wait timers on success and exact rejection without creating timeout errors', async () => {
	vi.useFakeTimers();
	try {
		const error = vi.fn(() => new Error('timed out'));
		expect(await withTimeout(Promise.resolve('ready'), 10, error)).toBe('ready');
		const reason = null;
		await expect(withTimeout(Promise.reject(reason), 10, error)).rejects.toBe(reason);
		expect(vi.getTimerCount()).toBe(0);
		expect(error).not.toHaveBeenCalled();
	} finally {
		vi.useRealTimers();
	}
});

it('times out only its wait while observing late settlement and allowing the next wait', async () => {
	vi.useFakeTimers();
	try {
		let reject!: (reason: unknown) => void;
		const pending = new Promise<never>((_resolve, failed) => {
			reject = failed;
		});
		const timeout = new Error('timed out');
		const error = vi.fn(() => timeout);
		const outcome = withTimeout(pending, 10, error).catch((reason: unknown) => reason);
		await vi.advanceTimersByTimeAsync(9);
		expect(error).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(await outcome).toBe(timeout);
		expect(error).toHaveBeenCalledOnce();
		reject(new Error('late failure'));
		await Promise.resolve();
		expect(vi.getTimerCount()).toBe(0);
		expect(await withTimeout(Promise.resolve('next'), 10, error)).toBe('next');
		expect(error).toHaveBeenCalledOnce();
	} finally {
		vi.useRealTimers();
	}
});
