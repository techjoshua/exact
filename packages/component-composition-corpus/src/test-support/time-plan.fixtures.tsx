import { TaskContext, type Component } from '@exactjs/core';
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
	const reading = { ['anchor']: this.state.anchor };
	const { anchor } = reading;
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
			<TimeAccuracyProbe />
		</section>
	);
}

/** Exercises a reactive explicit accuracy policy without requiring an inferred finite plan. */
function TimeAccuracyProbe(
	this: Component<{
		accuracy: 'millisecond' | 'disabled';
		timers: number;
		input: number;
		result: number;
	}>
) {
	const clock = createManualTimeClock(2750);
	this.state.accuracy = 'millisecond';
	this.state.input = 1;
	this.state.result = 0;
	// The policy parameter declares the activation without being read by this pure body.
	function increment(
		offset: number = 0,
		value: number,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_task: TaskContext = TaskContext.client().latest()
	) {
		return offset + value + 1;
	}
	const actions = { increment };
	const { increment: activate } = actions;
	this.state.result = activate(undefined, this.state.input);
	this.state.timers = -1;
	return () => (
		<aside data-time-accuracy-probe>
			<button data-task-result-next onClick={() => this.state.input++}>
				Next task input
			</button>
			<output data-task-result>{this.state.result}</output>
			<button
				data-accuracy-advance
				onClick={() => {
					clock.advance(1250);
					clock.runDue();
				}}
			>
				Advance explicit clock
			</button>
			<button
				data-accuracy-toggle
				onClick={() =>
					(this.state.accuracy = this.state.accuracy === 'disabled' ? 'millisecond' : 'disabled')
				}
			>
				Toggle explicit clock
			</button>
			<button data-accuracy-inspect onClick={() => (this.state.timers = clock.pendingTimerCount)}>
				Inspect explicit timers
			</button>
			<output data-accuracy-timers>{this.state.timers}</output>
			<TimeProvider clock={clock}>
				<time data-explicit-clock time:update={this.state.accuracy}>
					{Date.now()}
				</time>
			</TimeProvider>
		</aside>
	);
}
