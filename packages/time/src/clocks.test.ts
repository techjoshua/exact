import { afterEach, describe, expect, it, vi } from 'vitest';
import { timeInstant, wallTimeClock } from './clocks.js';

describe('wallTimeClock', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('shares one immutable sample during a synchronous cycle', async () => {
		const now = vi.spyOn(Date, 'now').mockReturnValueOnce(10).mockReturnValueOnce(20);

		const first = wallTimeClock.now();
		const second = wallTimeClock.now();

		expect(second).toBe(first);
		expect(Object.isFrozen(first)).toBe(true);
		expect(now).toHaveBeenCalledTimes(1);

		await Promise.resolve();
		expect(wallTimeClock.now().epochMilliseconds).toBe(20);
	});

	it('checkpoints deadlines beyond the host timer range without publishing early', () => {
		vi.stubGlobal('window', {});
		vi.spyOn(Date, 'now').mockReturnValue(1_000);
		const schedule = vi.spyOn(globalThis, 'setTimeout').mockReturnValue(1 as never);
		const notify = vi.fn();
		wallTimeClock.schedule(timeInstant(4_000_000_000), notify);
		expect(schedule).toHaveBeenCalledWith(notify, 2_147_483_647);
		expect(notify).not.toHaveBeenCalled();
	});
});
