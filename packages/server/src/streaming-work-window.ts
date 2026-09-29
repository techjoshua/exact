/**
 * Shares a half-millisecond progressive-rendering budget across a host's requests.
 * Check at render entry and after pending data settles. Promise settlement does not renew the
 * budget. Only the host's next-turn callback does. Individual authored work cannot be interrupted.
 */
export class StreamingRenderWorkWindow {
	private started: number | undefined;

	/** The host must defer reset until another event-loop turn without keeping an idle process alive. */
	constructor(private readonly nextTurn: (reset: () => void) => void) {}

	/** Uses a monotonic millisecond clock. True means this and later work should yield this turn. */
	shouldSchedule(now: number): boolean {
		if (this.started === undefined) {
			this.started = now;
			this.nextTurn(() => {
				this.started = undefined;
			});
		}
		return now - this.started >= 0.5;
	}
}
