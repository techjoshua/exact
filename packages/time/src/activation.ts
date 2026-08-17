import { reactive, unwrap } from '@exactjs/reactive';
import { afterReactiveSettlement } from '@exactjs/reactive/framework/settlement';
import { intl } from '@exactjs/core';
import {
	componentDomainWallClockSnapshot,
	currentComponentDomain,
	markComponentDomainWallClockUsed
} from '@exactjs/core/framework/component-domains';
import type {
	PreparedTimeActivation,
	TimeChangePlan,
	TimeClock,
	TimeEnvironment,
	TimePlanNumber,
	TimeUpdatePolicy
} from './contracts.js';
import { wallTimeClock } from './clocks.js';
import { nextTimeChange, validateTimeChangePlan } from './plan.js';
import {
	normalizeTimePolicy,
	schedulerForClock,
	type ClockScheduler,
	type TimeRegistration
} from './scheduler.js';

type TemporalInstant = {
	toZonedDateTimeISO(zone: unknown): {
		toPlainDateTime(): unknown;
		toPlainDate(): unknown;
		toPlainTime(): unknown;
	};
};

const activationBrand = Symbol.for('@exactjs/time.activation');

/** Internal mutable range binding created only by generated code. */
export interface TimeActivation extends PreparedTimeActivation {
	readonly [activationBrand]: true;
	readEpochMilliseconds(inputs?: readonly number[]): number;
	readDate(inputs?: readonly number[]): Date;
	readTemporalNow(kind: string, argument?: unknown, inputs?: readonly number[]): unknown;
	configure(policy: TimeUpdatePolicy | object, plan?: TimeChangePlan): void;
	configureEnvironment(environment: TimeEnvironment | TimeClock): void;
	mount(
		environment?: TimeEnvironment | TimeClock,
		options?: { deferInitialPublish?: boolean }
	): void;
	suspend(): void;
	dispose(): void;
}

/** Creates one range-local clock sample and finite scheduling registration. */
export function createTimeActivation(
	policy: PreparedTimeActivation['policy'],
	plan: TimeChangePlan,
	clockOrInputs: TimeClock | readonly number[] = wallTimeClock,
	initialInputs: readonly number[] = []
): TimeActivation {
	const clock = Array.isArray(clockOrInputs) ? wallTimeClock : (clockOrInputs as TimeClock);
	const domain = currentComponentDomain();
	if (clock === wallTimeClock && domain) markComponentDomainWallClockUsed(domain);
	const initialSample =
		clock === wallTimeClock && domain
			? (componentDomainWallClockSnapshot(domain) ?? clock.now().epochMilliseconds)
			: clock.now().epochMilliseconds;
	let validated = validateTimeChangePlan(plan);
	let currentInputs = validateTimeInputs(
		Array.isArray(clockOrInputs) ? clockOrInputs : initialInputs
	);
	let currentPolicy = normalizeTimePolicy(unwrap(policy));
	let currentClock = clock;
	let currentEnvironment: Omit<TimeEnvironment, 'clock'> = {};
	let scheduler: ClockScheduler | undefined;
	let mounted = false;
	let disposed = false;
	let pendingInitialPublish = false;
	let generation = 0;
	let deadline: number | undefined;
	const publishCurrentAfterSettlement = () => {
		pendingInitialPublish = currentPolicy !== 'disabled';
		if (!pendingInitialPublish) return;
		const capturedGeneration = generation;
		afterReactiveSettlement(() => {
			if (!mounted || disposed || generation !== capturedGeneration) return;
			pendingInitialPublish = false;
			state.sample = currentClock.now().epochMilliseconds;
			state.revision++;
			scheduler?.requestReconcile(registration);
		});
	};
	const state = reactive({ sample: initialSample, revision: 0 });
	const registration: TimeRegistration = {
		get active() {
			return mounted && !disposed && !pendingInitialPublish && currentPolicy !== 'disabled';
		},
		get generation() {
			return generation;
		},
		get policy() {
			return currentPolicy;
		},
		get deadline() {
			return deadline;
		},
		publish(sample, capturedGeneration) {
			if (capturedGeneration !== generation || !this.active) return;
			state.sample = sample.epochMilliseconds;
			state.revision++;
			deadline = undefined;
		},
		reconcile() {
			if (!this.active) {
				deadline = undefined;
				return;
			}
			if (currentPolicy === 'disabled') {
				deadline = undefined;
				return;
			}
			deadline = nextTimeChange(
				validated,
				currentPolicy,
				state.sample,
				currentEnvironment,
				currentInputs
			);
		}
	};
	const activation: TimeActivation = Object.freeze({
		__exactTime: true as const,
		[activationBrand]: true as const,
		policy,
		get plan() {
			return validated;
		},
		get inputs() {
			return currentInputs;
		},
		readEpochMilliseconds(inputs?: readonly number[]) {
			if (inputs) {
				const observed = validateTimeInputs(inputs);
				if (!sameTimeInputs(currentInputs, observed)) {
					currentInputs = observed;
					generation++;
					deadline = undefined;
					scheduler?.requestReconcile(registration);
				}
			}
			void state.revision;
			return state.sample;
		},
		readDate(inputs?: readonly number[]) {
			return new Date(this.readEpochMilliseconds(inputs));
		},
		readTemporalNow(kind: string, argument?: unknown, inputs?: readonly number[]) {
			if (Array.isArray(argument) && inputs === undefined) {
				inputs = argument;
				argument = undefined;
			}
			const temporal = (
				globalThis as typeof globalThis & {
					Temporal?: {
						Instant?: { fromEpochMilliseconds(value: number): TemporalInstant };
						Now?: { timeZoneId?(): string };
					};
				}
			).Temporal;
			if (!temporal?.Instant?.fromEpochMilliseconds)
				throw new Error('Temporal clock reads require a Temporal implementation');
			const instant = temporal.Instant.fromEpochMilliseconds(this.readEpochMilliseconds(inputs));
			if (kind === 'instant') return instant;
			const zone = argument ?? temporal.Now?.timeZoneId?.() ?? 'UTC';
			const zoned = instant.toZonedDateTimeISO(zone);
			if (kind === 'zonedDateTimeISO') return zoned;
			if (kind === 'plainDateTimeISO') return zoned.toPlainDateTime();
			if (kind === 'plainDateISO') return zoned.toPlainDate();
			if (kind === 'plainTimeISO') return zoned.toPlainTime();
			throw new TypeError(`Unsupported Temporal.Now clock source ${kind}`);
		},
		configure(nextPolicy: TimeUpdatePolicy | object, nextPlan?: TimeChangePlan) {
			if (disposed) return;
			const normalized = normalizeTimePolicy(unwrap(nextPolicy));
			const planValue = nextPlan ? validateTimeChangePlan(nextPlan) : validated;
			if (normalized === currentPolicy && sameTimePlan(planValue, validated)) return;
			const restarting = currentPolicy === 'disabled' && normalized !== 'disabled';
			currentPolicy = normalized;
			validated = planValue;
			generation++;
			deadline = undefined;
			if (mounted && restarting) publishCurrentAfterSettlement();
			scheduler?.requestReconcile(registration);
		},
		configureEnvironment(value: TimeEnvironment | TimeClock) {
			if (disposed) return;
			const environment: TimeEnvironment = 'clock' in value ? value : { clock: value };
			const nextAxes = normalizeTimeEnvironmentAxes(environment);
			if (environment.clock === currentClock && sameTimeEnvironment(nextAxes, currentEnvironment))
				return;
			generation++;
			deadline = undefined;
			const clockChanged = environment.clock !== currentClock;
			if (mounted && clockChanged) scheduler?.delete(registration);
			currentClock = environment.clock;
			currentEnvironment = nextAxes;
			if (mounted && scheduler?.clockIdentity !== currentClock) {
				scheduler = schedulerForClock(currentClock);
				publishCurrentAfterSettlement();
				scheduler.add(registration);
			} else {
				scheduler?.requestReconcile(registration);
			}
		},
		mount(
			value: TimeEnvironment | TimeClock = { clock: currentClock },
			options: { deferInitialPublish?: boolean } = {}
		) {
			if (disposed || mounted) return;
			const environment: TimeEnvironment = 'clock' in value ? value : { clock: value };
			const nextAxes = normalizeTimeEnvironmentAxes(environment);
			mounted = true;
			currentClock = environment.clock;
			currentEnvironment = nextAxes;
			scheduler = schedulerForClock(currentClock);
			pendingInitialPublish = options.deferInitialPublish === true && currentPolicy !== 'disabled';
			scheduler.add(registration);
			if (pendingInitialPublish) {
				publishCurrentAfterSettlement();
			} else if (currentPolicy !== 'disabled') {
				const sample = currentClock.now();
				state.sample = sample.epochMilliseconds;
				state.revision++;
			}
		},
		suspend() {
			if (disposed || !mounted) return;
			mounted = false;
			pendingInitialPublish = false;
			generation++;
			deadline = undefined;
			scheduler?.delete(registration);
			scheduler = undefined;
		},
		dispose() {
			if (disposed) return;
			activation.suspend();
			disposed = true;
		}
	});
	return activation;
}

function normalizeTimeEnvironmentAxes(
	environment: TimeEnvironment
): Omit<TimeEnvironment, 'clock'> {
	if (
		environment.weekStartsOn !== undefined &&
		(!Number.isInteger(environment.weekStartsOn) ||
			environment.weekStartsOn < 0 ||
			environment.weekStartsOn > 6)
	)
		throw new TypeError('A time environment week start must be an integer from 0 through 6');
	if (environment.timeZone || environment.calendar)
		intl.DateTimeFormat('en', {
			...(environment.timeZone ? { timeZone: environment.timeZone } : {}),
			...(environment.calendar ? { calendar: environment.calendar } : {})
		});
	return {
		...(environment.timeZone ? { timeZone: environment.timeZone } : {}),
		...(environment.calendar ? { calendar: environment.calendar } : {}),
		...(environment.weekStartsOn !== undefined ? { weekStartsOn: environment.weekStartsOn } : {})
	};
}

function validateTimeInputs(values: readonly number[]): readonly number[] {
	if (
		!Array.isArray(values) ||
		values.length > 256 ||
		values.some((value) => !Number.isFinite(value))
	)
		throw new TypeError('Time plan inputs must be a bounded array of finite numbers');
	return Object.freeze([...values]);
}

function sameTimeInputs(left: readonly number[], right: readonly number[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameTimeEnvironment(
	left: Omit<TimeEnvironment, 'clock'>,
	right: Omit<TimeEnvironment, 'clock'>
): boolean {
	return (
		left.timeZone === right.timeZone &&
		left.calendar === right.calendar &&
		left.weekStartsOn === right.weekStartsOn
	);
}

function sameTimePlan(left: TimeChangePlan, right: TimeChangePlan): boolean {
	if (left.kind !== right.kind) return false;
	switch (left.kind) {
		case 'continuous':
		case 'complete':
			return true;
		case 'quantized':
			return (
				right.kind === 'quantized' &&
				left.quantumMilliseconds === right.quantumMilliseconds &&
				sameTimePlanNumber(left.anchorMilliseconds, right.anchorMilliseconds) &&
				left.boundary === right.boundary
			);
		case 'calendar':
			return (
				right.kind === 'calendar' &&
				left.unit === right.unit &&
				left.timeZone === right.timeZone &&
				left.calendar === right.calendar &&
				left.weekStartsOn === right.weekStartsOn
			);
		case 'earliest':
			return (
				right.kind === 'earliest' &&
				left.plans.length === right.plans.length &&
				left.plans.every((plan, index) => sameTimePlan(plan, right.plans[index]!))
			);
		case 'threshold':
			return (
				right.kind === 'threshold' &&
				sameTimePlanNumber(left.thresholdMilliseconds, right.thresholdMilliseconds) &&
				sameTimePlan(left.before, right.before) &&
				sameTimePlan(left.after, right.after)
			);
	}
}

function sameTimePlanNumber(left: TimePlanNumber, right: TimePlanNumber): boolean {
	return typeof left === 'number'
		? left === right
		: typeof right !== 'number' && left.binding === right.binding;
}

/** Reports whether a generated enhancement value is a live time activation. */
export function isTimeActivation(value: unknown): value is TimeActivation {
	return Boolean(value && typeof value === 'object' && (value as TimeActivation)[activationBrand]);
}
