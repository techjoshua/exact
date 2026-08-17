import type { TimeClock, TimeInstant } from './contracts.js';

const maximumHostDelay = 2_147_483_647;
let sharedWallSample: TimeInstant | undefined;
let wallSampleResetPending = false;

function wallSample(): TimeInstant {
	sharedWallSample ??= Object.freeze({ epochMilliseconds: Date.now() });
	if (!wallSampleResetPending) {
		wallSampleResetPending = true;
		queueMicrotask(() => {
			sharedWallSample = undefined;
			wallSampleResetPending = false;
		});
	}
	return sharedWallSample;
}

/**
 * Shared default wall clock. Its identity joins every compatible package copy, while `now()`
 * returns one immutable sample for all reads in the current synchronous reactive or render cycle.
 */
export const wallTimeClock: TimeClock = Object.freeze({
	now: wallSample,
	schedule(deadline: TimeInstant, notify: () => void) {
		if (!('window' in globalThis)) return () => undefined;
		const delay = Math.min(maximumHostDelay, Math.max(0, deadline.epochMilliseconds - Date.now()));
		const handle = setTimeout(notify, delay);
		return () => clearTimeout(handle);
	},
	subscribeWake(notify: () => void) {
		if (!('window' in globalThis) || !('document' in globalThis)) return () => undefined;
		const visible = () => {
			if (document.visibilityState === 'visible') notify();
		};
		window.addEventListener('pageshow', notify);
		document.addEventListener('visibilitychange', visible);
		return () => {
			window.removeEventListener('pageshow', notify);
			document.removeEventListener('visibilitychange', visible);
		};
	}
});

/** Creates an immutable instant after validating its finite epoch value. */
export function timeInstant(epochMilliseconds: number): TimeInstant {
	if (!Number.isFinite(epochMilliseconds)) throw new TypeError('A time instant must be finite');
	return Object.freeze({ epochMilliseconds });
}
