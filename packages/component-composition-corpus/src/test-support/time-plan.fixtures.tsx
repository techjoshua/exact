import { type Component } from '@exactjs/core';
import { TimeProvider } from '@exactjs/time';
// The namespace supplies the compiler-owned time:update capability.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as time from '@exactjs/time/enhancements' with { type: 'exact-enhancement' };
import { createManualTimeClock } from '@exactjs/time/testing';

/**
 * Exercises a completed finite clock plan, changed anchor, and owned range retirement.
 * The manual clock belongs to the client instance and is never a serialized server capture.
 * @exact client
 */
export function TimeWindowProbe(
	this: Component<{ anchor: number; visible: boolean; timers: number }>
) {
	const clock = createManualTimeClock(2750);
	this.state.anchor = 1250;
	this.state.visible = true;
	this.state.timers = -1;
	const anchor = this.state.anchor;
	return () => (
		<section data-time-window-probe>
			<output data-computed-clock-format>
				{new Intl.DateTimeFormat('en-US', { ['second']: 'numeric', timeZone: 'UTC' }).format(2750)}
			</output>
			<button
				data-clock-late
				onClick={() => {
					clock.advance(5250);
					clock.runDue();
				}}
			>
				Advance clock
			</button>
			<button
				data-clock-anchor
				onClick={() => (this.state.anchor = clock.now().epochMilliseconds - 500)}
			>
				Change clock anchor
			</button>
			<button
				data-clock-boundary
				onClick={() => {
					clock.advance(1500);
					clock.runDue();
				}}
			>
				Next clock boundary
			</button>
			<button data-clock-remove onClick={() => (this.state.visible = false)}>
				Remove clock range
			</button>
			<button data-clock-restore onClick={() => (this.state.visible = true)}>
				Restore clock range
			</button>
			<button data-clock-inspect onClick={() => (this.state.timers = clock.pendingTimerCount)}>
				Inspect owned timers
			</button>
			<output data-clock-timers>{this.state.timers}</output>
			<TimeProvider clock={clock}>
				{this.state.visible && (
					<time data-clock-window time:update>
						{Math.abs(Math.floor((Date.now() - anchor) / 1000)) < 2 ? 'inside' : 'outside'}
					</time>
				)}
			</TimeProvider>
		</section>
	);
}
