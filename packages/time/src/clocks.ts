import type { TimeClock, TimeInstant } from './contracts.js';

const maximumHostDelay = 2_147_483_647;
let sharedWallSample: number | undefined;
let wallSampleResetPending = false;

function wallSample(): TimeInstant {
	sharedWallSample ??= Date.now();
	if (!wallSampleResetPending) {
		wallSampleResetPending = true;
		queueMicrotask(() => {
			sharedWallSample = undefined;
			wallSampleResetPending = false;
		});
	}
	return { epochMilliseconds: sharedWallSample };
}

/**
 * Shared default wall clock. Its identity joins every compatible package copy, while `now()`
 * samples once in the current synchronous reactive or render cycle and returns independent observations.
 * @exact shared
 */
export const wallTimeClock: TimeClock = {
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
};

/**
 * Creates an ordinary instant with TypeScript readonly properties from milliseconds since the Unix epoch.
 * Accepts finite numbers, including negative and fractional values. Throws for NaN or infinity.
 * This constructs a value only and does not schedule a timer.
 */
export function timeInstant(epochMilliseconds: number): TimeInstant {
	return { epochMilliseconds: validateTimeEpoch(epochMilliseconds) };
}

/** Captures the finite numeric contract used by clocks and explicit instant construction. */
export function validateTimeEpoch(epochMilliseconds: number): number {
	if (!Number.isFinite(epochMilliseconds)) throw new TypeError('A clock sample must be finite');
	return epochMilliseconds;
}
