import { batch } from '@exactjs/reactive';
import { afterReactiveSettlement } from '@exactjs/reactive/framework/settlement';
import type { TimeClock, TimeInstant, TimeUpdatePolicy } from './contracts.js';

/** Range-local operations consumed by the shared scheduler without retaining component instances. */
export interface TimeRegistration {
	readonly active: boolean;
	readonly policy: Exclude<TimeUpdatePolicy, true>;
	readonly generation: number;
	readonly deadline: number | undefined;
	publish(sample: TimeInstant, generation: number): void;
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
		if (!this.registrations.size && this.clock.subscribeWake)
			this.cancelWake = this.clock.subscribeWake(this.wake);
		this.registrations.add(registration);
		this.requestReconcile(registration);
	}

	/** Removes a range and fences every callback captured before removal. */
	delete(registration: TimeRegistration): void {
		this.registrations.delete(registration);
		this.dirty.delete(registration);
		if (!this.registrations.size) {
			this.cancelWake?.();
			this.cancelWake = undefined;
			this.deadlines.length = 0;
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
		return deadline === undefined ? undefined : Object.freeze({ epochMilliseconds: deadline });
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
		return Object.freeze({
			activeRegistrations: this.activeCount,
			disabledRegistrations,
			nextDeadline: this.nextDeadline,
			coalescedBoundaries: this.coalescedBoundaries,
			lastCycleMilliseconds: this.lastCycleMilliseconds,
			policies: Object.freeze(policies)
		});
	}

	private readonly reconcile = (): void => {
		if (this.reconciling) return;
		this.reconciling = true;
		try {
			if (this.cycleStartedAt !== undefined) {
				this.lastCycleMilliseconds = monotonicNow() - this.cycleStartedAt;
				this.cycleStartedAt = undefined;
			}
			this.cancelTimer?.();
			this.cancelTimer = undefined;
			for (const registration of this.dirty) {
				registration.reconcile();
				if (registration.active && registration.deadline !== undefined)
					this.pushDeadline({
						deadline: registration.deadline,
						generation: registration.generation,
						registration
					});
			}
			this.dirty.clear();
			if (this.deadlines.length > this.registrations.size * 2 + 32) this.compactDeadlines();
			const deadline = this.earliestDeadline();
			if (deadline === undefined) return;
			const generation = ++this.armGeneration;
			this.cancelTimer = this.clock.schedule(Object.freeze({ epochMilliseconds: deadline }), () =>
				this.fire(generation)
			);
		} finally {
			this.reconciling = false;
		}
	};

	private fire(generation: number): void {
		if (generation !== this.armGeneration) return;
		this.cancelTimer = undefined;
		const sample = this.clock.now();
		this.cycleStartedAt = monotonicNow();
		const due: TimeRegistration[] = [];
		for (;;) {
			const entry = this.peekValidDeadline();
			if (!entry || entry.deadline > sample.epochMilliseconds) break;
			this.popDeadline();
			if (entry.deadline < sample.epochMilliseconds) this.coalescedBoundaries++;
			due.push(entry.registration);
			this.dirty.add(entry.registration);
		}
		batch(() => {
			for (const registration of due) registration.publish(sample, registration.generation);
		});
		this.requestReconcile();
	}

	private readonly wake = (): void => {
		this.cancelTimer?.();
		this.cancelTimer = undefined;
		this.fire(++this.armGeneration);
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
