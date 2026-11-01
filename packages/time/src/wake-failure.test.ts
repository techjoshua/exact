import { expect, it } from 'vitest';
import { createTimeActivation } from './activation.js';
import {
	verifyTimeWakeFailures,
	verifyTimeTimerRetirement
} from '../../component-composition-corpus/test-support/time-lifecycle-journey.mjs';
it('retires a timer before cleanup and preserves independent wake progress', async () => {
	expect(await verifyTimeWakeFailures({ createTimeActivation })).toBe(true);
});

it('retires disabled timers and continues reconciliation after cleanup fails', async () => {
	expect(await verifyTimeTimerRetirement({ createTimeActivation })).toBe(true);
});
