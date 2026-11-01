import { validateTimeEpoch } from './clocks.js';
import { attemptCleanup, createCleanupFailure, throwCleanupFailure } from '@exactjs/core';
import { batch } from '@exactjs/reactive';
import { afterReactiveSettlement } from '@exactjs/reactive/framework/settlement';
import type { TimeClock, TimeInstant, TimeUpdatePolicy } from './contracts.js';

/** Range-local operations consumed by the shared scheduler without retaining component instances. */
export interface TimeRegistration {
	readonly active: boolean;
	readonly policy: Exclude<TimeUpdatePolicy, true>;
	readonly generation: number;
	readonly deadline: number | undefined;
	publish(epochMilliseconds: number, generation: number): void;
	reconcile(): void;
}

const schedulers = new WeakMap<TimeClock, ClockScheduler>();

/** Returns the realm-shared scheduler selected by clock object identity. */
export function schedulerForClock(clock: TimeClock): ClockScheduler {
	let scheduler = schedulers.get(clock);
	if (!scheduler) {
		scheduler = new ClockScheduler(clock);
		schedulers.set(clock, scheduler);
	}
	return scheduler;
}

/** One-shot earliest-deadline scheduler with generation fencing and settlement rearming. */
export class ClockScheduler {
	private readonly registrations = new Set<TimeRegistration>();
	private readonly dirty = new Set<TimeRegistration>();
	private readonly deadlines: Array<{
		deadline: number;
		generation: number;
		registration: TimeRegistration;
	}> = [];
	private cancelTimer?: () => void;
	private cancelWake?: () => void;
	private wakeOwner?: object;
	private armGeneration = 0;
	private reconciling = false;
	private cycleStartedAt?: number;
	private coalescedBoundaries = 0;
	private lastCycleMilliseconds?: number;

	constructor(private readonly clock: TimeClock) {}

	/** Clock identity owned by this scheduler. */
	get clockIdentity(): TimeClock {
		return this.clock;
	}

	/** Adds a mounted range and schedules reconciliation after its mounting transaction. */
	add(registration: TimeRegistration): void {
		this.registrations.add(registration);
		if (!this.wakeOwner && this.clock.subscribeWake) {
			const owner = (this.wakeOwner = {});
			try {
				const cancel = this.clock.subscribeWake(() => {
					if (this.wakeOwner === owner) this.wake();
				});
				if (this.wakeOwner === owner) this.cancelWake = cancel;
				else cancel();
			} catch (error) {
				this.delete(registration);
				throw error;
			}
		}
		this.requestReconcile(registration);
	}

	/** Removes a range and fences every callback captured before removal. */
	delete(registration: TimeRegistration): void {
		this.registrations.delete(registration);
		this.dirty.delete(registration);
		if (!this.registrations.size) {
			this.wakeOwner = undefined;
			this.armGeneration++;
			const cancelWake = this.cancelWake;
			const cancelTimer = this.cancelTimer;
			this.cancelWake = this.cancelTimer = undefined;
			this.deadlines.length = 0;
			const failure = createCleanupFailure();
			attemptCleanup(failure, () => cancelWake?.());
			attemptCleanup(failure, () => cancelTimer?.());
			this.requestReconcile();
			throwCleanupFailure(failure);
			return;
		}
		this.requestReconcile();
	}

	/** Marks final policy, plan, or input state for reconciliation after reactive settlement. */
	requestReconcile(registration?: TimeRegistration): void {
		if (registration && this.registrations.has(registration)) this.dirty.add(registration);
		afterReactiveSettlement(this.reconcile);
	}

	/** Number of active registrations, exposed for bounded inspection and tests. */
	get activeCount(): number {
		let count = 0;
		for (const registration of this.registrations) if (registration.active) count++;
		return count;
	}

	/** Currently armed absolute deadline, if any. */
	get nextDeadline(): TimeInstant | undefined {
		const deadline = this.earliestDeadline();
		return deadline === undefined ? undefined : { epochMilliseconds: deadline };
	}

	/** Bounded scheduler state for tests and DevTools without exposing registrations or owners. */
	get summary(): Readonly<{
		activeRegistrations: number;
		disabledRegistrations: number;
		nextDeadline: TimeInstant | undefined;
		coalescedBoundaries: number;
		lastCycleMilliseconds: number | undefined;
		policies: Readonly<Record<string, number>>;
	}> {
		const policies: Record<string, number> = {};
		let disabledRegistrations = 0;
		for (const registration of this.registrations) {
			if (!registration.active) disabledRegistrations++;
			else policies[registration.policy] = (policies[registration.policy] ?? 0) + 1;
		}
		return {
			activeRegistrations: this.activeCount,
			disabledRegistrations,
			nextDeadline: this.nextDeadline,
			coalescedBoundaries: this.coalescedBoundaries,
			lastCycleMilliseconds: this.lastCycleMilliseconds,
			policies: policies
		};
	}

	private readonly reconcile = (): void => {
		if (this.reconciling) return;
		this.reconciling = true;
		try {
			if (this.cycleStartedAt !== undefined) {
				this.lastCycleMilliseconds = monotonicNow() - this.cycleStartedAt;
				this.cycleStartedAt = undefined;
			}
			const failure = createCleanupFailure();
			const cancel = this.cancelTimer;
			this.cancelTimer = undefined;
			this.armGeneration++;
			attemptCleanup(failure, () => cancel?.());
			for (const registration of this.dirty) {
				attemptCleanup(failure, () => {
					registration.reconcile();
					if (registration.active && registration.deadline !== undefined)
						this.pushDeadline({
							deadline: registration.deadline,
							generation: registration.generation,
							registration
						});
				});
			}
			this.dirty.clear();
			if (this.deadlines.length > this.registrations.size * 2 + 32) this.compactDeadlines();
			const deadline = this.earliestDeadline();
			if (deadline !== undefined)
				attemptCleanup(failure, () => {
					const generation = ++this.armGeneration;
					const cancel = this.clock.schedule({ epochMilliseconds: deadline }, () =>
						this.fire(generation)
					);
					if (generation === this.armGeneration && this.registrations.size)
						this.cancelTimer = cancel;
					else cancel();
				});
			throwCleanupFailure(failure);
		} finally {
			this.reconciling = false;
		}
	};

	private fire(generation: number): void {
		if (generation !== this.armGeneration || !this.registrations.size) return;
		this.cancelTimer = undefined;
		const sample = this.clock.now().epochMilliseconds;
		if (generation !== this.armGeneration || !this.registrations.size) return;
		validateTimeEpoch(sample);
		this.cycleStartedAt = monotonicNow();
		const due: typeof this.deadlines = [];
		for (;;) {
			const entry = this.peekValidDeadline();
			if (!entry || entry.deadline > sample) break;
			this.popDeadline();
			if (entry.deadline < sample) this.coalescedBoundaries++;
			due.push(entry);
			this.dirty.add(entry.registration);
		}
		batch(() => {
			for (const entry of due) {
				const registration = entry.registration;
				if (
					this.registrations.has(registration) &&
					registration.active &&
					registration.generation === entry.generation
				)
					registration.publish(sample, entry.generation);
			}
		});
		this.requestReconcile();
	}

	private readonly wake = (): void => {
		const cancel = this.cancelTimer;
		this.cancelTimer = undefined;
		const generation = ++this.armGeneration;
		const failure = createCleanupFailure();
		attemptCleanup(failure, () => cancel?.());
		attemptCleanup(failure, () => this.fire(generation));
		throwCleanupFailure(failure);
	};

	private earliestDeadline(): number | undefined {
		return this.peekValidDeadline()?.deadline;
	}

	private peekValidDeadline(): (typeof this.deadlines)[number] | undefined {
		for (;;) {
			const entry = this.deadlines[0];
			if (!entry) return undefined;
			if (
				this.registrations.has(entry.registration) &&
				entry.registration.active &&
				entry.registration.generation === entry.generation &&
				entry.registration.deadline === entry.deadline
			)
				return entry;
			this.popDeadline();
		}
	}

	private pushDeadline(entry: (typeof this.deadlines)[number]): void {
		let index = this.deadlines.push(entry) - 1;
		while (index > 0) {
			const parent = Math.floor((index - 1) / 2);
			if (this.deadlines[parent]!.deadline <= entry.deadline) break;
			this.deadlines[index] = this.deadlines[parent]!;
			index = parent;
		}
		this.deadlines[index] = entry;
	}

	private popDeadline(): void {
		const tail = this.deadlines.pop();
		if (!tail || !this.deadlines.length) return;
		let index = 0;
		for (;;) {
			const left = index * 2 + 1;
			if (left >= this.deadlines.length) break;
			const right = left + 1;
			const child =
				right < this.deadlines.length &&
				this.deadlines[right]!.deadline < this.deadlines[left]!.deadline
					? right
					: left;
			if (this.deadlines[child]!.deadline >= tail.deadline) break;
			this.deadlines[index] = this.deadlines[child]!;
			index = child;
		}
		this.deadlines[index] = tail;
	}

	private compactDeadlines(): void {
		const current = [...this.registrations]
			.filter((registration) => registration.active && registration.deadline !== undefined)
			.map((registration) => ({
				deadline: registration.deadline!,
				generation: registration.generation,
				registration
			}));
		this.deadlines.length = 0;
		for (const entry of current) this.pushDeadline(entry);
	}
}

function monotonicNow(): number {
	return typeof performance === 'object' ? performance.now() : Date.now();
}

/** Narrows the runtime policy after unwrapping generated reactive values. */
export function normalizeTimePolicy(value: unknown): Exclude<TimeUpdatePolicy, true> {
	if (value === true) return 'auto';
	if (
		value === 'auto' ||
		value === 'millisecond' ||
		value === 'second' ||
		value === 'minute' ||
		value === 'hour' ||
		value === 'day' ||
		value === 'week' ||
		value === 'month' ||
		value === 'year' ||
		value === 'disabled'
	)
		return value;
	throw new TypeError(`Unsupported time:update policy ${String(value)}`);
}
