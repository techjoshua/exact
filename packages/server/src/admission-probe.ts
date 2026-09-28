/** Schedules a callback after the current event-loop turn and returns its cancellation function. */
export type AdmissionProbeTurn = (reset: () => void) => () => void;

/**
 * Bounds uninterrupted immediate admission while an adapter rechecks a previously useful policy.
 * The adapter observes before each start and restores that policy when this returns false.
 * A completed event-loop turn renews the eight-millisecond budget. This cannot interrupt an
 * individual render and is neither a response deadline nor a limit on asynchronous work.
 * Reset when the probe ends, becomes idle, or switches back to scheduled admission.
 */
export class ImmediateAdmissionProbe {
	private started: number | undefined;
	private cancel: (() => void) | undefined;

	/** The host must defer the callback and make cancellation release its pending turn handle. */
	constructor(private readonly yieldTurn: AdmissionProbeTurn) {}

	/** Uses the host's monotonic millisecond clock before starting another immediate request. */
	observe(now: number): boolean {
		if (this.started === undefined) {
			this.started = now;
			this.cancel = this.yieldTurn(() => {
				this.started = undefined;
				this.cancel = undefined;
			});
			return true;
		}
		if (now - this.started < 8) return true;
		this.reset();
		return false;
	}

	/** Releases the probe's turn callback and discards its consumed budget. Safe to repeat. */
	reset(): void {
		this.cancel?.();
		this.cancel = undefined;
		this.started = undefined;
	}
}
