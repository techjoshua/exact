import type { TimeClock, TimeInstant } from './contracts.js';
import { timeInstant } from './clocks.js';
import { schedulerForClock } from './scheduler.js';

/** Deterministic one-shot clock used to inspect deadlines without real sleeping. */
export interface ManualTimeClock extends TimeClock {
	advance(milliseconds: number): void;
	runDue(): void;
	wake(): void;
	readonly nextDeadline: TimeInstant | undefined;
	readonly pendingTimerCount: number;
}

/** Creates a manual clock whose advancement and due-work publication are deliberately separate. */
export function createManualTimeClock(initialEpochMilliseconds = 0): ManualTimeClock {
	let current = initialEpochMilliseconds;
	let nextId = 1;
	const timers = new Map<number, { deadline: number; notify: () => void }>();
	const wakeSubscribers = new Set<() => void>();
	return Object.freeze({
		now: () => timeInstant(current),
		schedule(deadline: TimeInstant, notify: () => void) {
			const id = nextId++;
			timers.set(id, { deadline: deadline.epochMilliseconds, notify });
			return () => timers.delete(id);
		},
		advance(milliseconds: number) {
			if (!Number.isFinite(milliseconds) || milliseconds < 0)
				throw new TypeError('Manual clock advancement must be finite and non-negative');
			current += milliseconds;
		},
		runDue() {
			const due = [...timers]
				.filter(([, timer]) => timer.deadline <= current)
				.sort((left, right) => left[1].deadline - right[1].deadline);
			for (const [id, timer] of due) {
				if (!timers.delete(id)) continue;
				timer.notify();
			}
		},
		subscribeWake(notify: () => void) {
			wakeSubscribers.add(notify);
			return () => wakeSubscribers.delete(notify);
		},
		wake() {
			for (const notify of [...wakeSubscribers]) notify();
		},
		get nextDeadline() {
			let deadline: number | undefined;
			for (const timer of timers.values())
				if (deadline === undefined || timer.deadline < deadline) deadline = timer.deadline;
			return deadline === undefined ? undefined : timeInstant(deadline);
		},
		get pendingTimerCount() {
			return timers.size;
		}
	});
}

/** Returns a bounded scheduler summary without exposing registrations or component instances. */
export function inspectTimeClock(clock: TimeClock): Readonly<{
	activeRegistrations: number;
	disabledRegistrations: number;
	nextDeadline: TimeInstant | undefined;
	coalescedBoundaries: number;
	lastCycleMilliseconds: number | undefined;
	policies: Readonly<Record<string, number>>;
}> {
	return schedulerForClock(clock).summary;
}
