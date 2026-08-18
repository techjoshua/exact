import type {
	TimeChangePlan,
	TimeEnvironment,
	TimePlanNumber,
	TimeUpdatePolicy
} from './contracts.js';
import { intl } from '@exactjs/core';

const fixedPolicyMilliseconds = Object.freeze({
	millisecond: 1,
	second: 1_000,
	minute: 60_000,
	hour: 3_600_000
} as const);

const maximumPlanDepth = 32;
const maximumPlanNodes = 256;

/** Validates and freezes compiler-emitted time plan data before it reaches scheduling state. */
export function validateTimeChangePlan(value: unknown): TimeChangePlan {
	const budget = { nodes: 0 };
	return validatePlan(value, 0, budget);
}

function validatePlan(value: unknown, depth: number, budget: { nodes: number }): TimeChangePlan {
	if (!value || typeof value !== 'object')
		throw new TypeError('A time change plan must be an object');
	if (depth > maximumPlanDepth) throw new TypeError('A time change plan exceeds its maximum depth');
	if (++budget.nodes > maximumPlanNodes)
		throw new TypeError('A time change plan exceeds its maximum node count');
	const plan = value as Partial<TimeChangePlan> & Record<string, unknown>;
	if (plan.protocol !== 1) throw new TypeError('Unsupported time change plan protocol');
	switch (plan.kind) {
		case 'continuous':
		case 'complete':
			assertOnlyKeys(plan, ['protocol', 'kind']);
			return Object.freeze({ protocol: 1, kind: plan.kind });
		case 'quantized': {
			assertOnlyKeys(plan, [
				'protocol',
				'kind',
				'quantumMilliseconds',
				'anchorMilliseconds',
				'boundary'
			]);
			const quantum = plan.quantumMilliseconds;
			if (typeof quantum !== 'number' || !Number.isFinite(quantum) || quantum <= 0)
				throw new TypeError('A quantized time plan requires a positive finite quantum');
			const anchor = validatePlanNumber(plan.anchorMilliseconds, 'anchor');
			if (
				plan.boundary !== 'floor-increasing' &&
				plan.boundary !== 'ceil-decreasing' &&
				plan.boundary !== 'round-increasing' &&
				plan.boundary !== 'round-decreasing' &&
				plan.boundary !== 'half-expand-increasing' &&
				plan.boundary !== 'half-expand-decreasing' &&
				plan.boundary !== 'trunc-increasing' &&
				plan.boundary !== 'trunc-decreasing'
			)
				throw new TypeError('A quantized time plan has an unsupported boundary');
			return Object.freeze({
				protocol: 1,
				kind: 'quantized',
				quantumMilliseconds: quantum,
				anchorMilliseconds: anchor,
				boundary: plan.boundary
			});
		}
		case 'calendar':
			assertOnlyKeys(plan, ['protocol', 'kind', 'unit', 'timeZone', 'calendar', 'weekStartsOn']);
			if (!['day', 'week', 'month', 'year'].includes(String(plan.unit)))
				throw new TypeError('A calendar time plan has an unsupported unit');
			if (plan.timeZone !== undefined && (typeof plan.timeZone !== 'string' || !plan.timeZone))
				throw new TypeError('A calendar time plan has an invalid time zone');
			intl.DateTimeFormat('en', {
				...(plan.timeZone ? { timeZone: plan.timeZone } : {}),
				...(typeof plan.calendar === 'string' ? { calendar: plan.calendar } : {})
			});
			if (
				plan.weekStartsOn !== undefined &&
				(typeof plan.weekStartsOn !== 'number' ||
					!Number.isInteger(plan.weekStartsOn) ||
					plan.weekStartsOn < 0 ||
					plan.weekStartsOn > 6)
			)
				throw new TypeError('A calendar time plan requires a week start from 0 through 6');
			return Object.freeze({ ...plan }) as TimeChangePlan;
		case 'earliest': {
			assertOnlyKeys(plan, ['protocol', 'kind', 'plans']);
			if (!Array.isArray(plan.plans) || plan.plans.length < 2)
				throw new TypeError('An earliest time plan requires at least two child plans');
			return Object.freeze({
				protocol: 1,
				kind: 'earliest',
				plans: Object.freeze(plan.plans.map((child) => validatePlan(child, depth + 1, budget)))
			});
		}
		case 'threshold': {
			assertOnlyKeys(plan, ['protocol', 'kind', 'thresholdMilliseconds', 'before', 'after']);
			const thresholdMilliseconds = validatePlanNumber(plan.thresholdMilliseconds, 'threshold');
			return Object.freeze({
				protocol: 1,
				kind: 'threshold',
				thresholdMilliseconds,
				before: validatePlan(plan.before, depth + 1, budget),
				after: validatePlan(plan.after, depth + 1, budget)
			});
		}
		default:
			throw new TypeError('Unsupported time change plan kind');
	}
}

/** Calculates the first conservative deadline after a published clock sample. */
export function nextTimeChange(
	plan: TimeChangePlan,
	policy: Exclude<TimeUpdatePolicy, true | 'disabled'>,
	sample: number,
	environment?: Omit<TimeEnvironment, 'clock'>,
	inputs: readonly number[] = []
): number | undefined {
	const inferred =
		plan.kind === 'continuous' && policy !== 'auto'
			? undefined
			: inferredDeadline(plan, sample, environment, inputs);
	const explicit = explicitDeadline(policy, sample, environment);
	if (inferred === undefined) return explicit;
	if (explicit === undefined) return inferred;
	return Math.min(inferred, explicit);
}

function inferredDeadline(
	plan: TimeChangePlan,
	sample: number,
	environment: Omit<TimeEnvironment, 'clock'> | undefined,
	inputs: readonly number[]
): number | undefined {
	switch (plan.kind) {
		case 'complete':
			return undefined;
		case 'continuous':
			throw new TypeError('Automatic time updates require a compiler-provable next-change plan');
		case 'earliest': {
			let earliest: number | undefined;
			for (const child of plan.plans) {
				const candidate = inferredDeadline(child, sample, environment, inputs);
				if (candidate !== undefined && (earliest === undefined || candidate < earliest))
					earliest = candidate;
			}
			return earliest;
		}
		case 'threshold': {
			const threshold = resolvePlanNumber(plan.thresholdMilliseconds, inputs);
			if (sample >= threshold) return inferredDeadline(plan.after, sample, environment, inputs);
			const active = inferredDeadline(plan.before, sample, environment, inputs);
			return active === undefined ? threshold : Math.min(active, threshold);
		}
		case 'calendar':
			return nextCalendarBoundary(
				sample,
				plan.unit,
				plan.timeZone ?? environment?.timeZone ?? resolvedLocalTimeZone(),
				plan.calendar ?? environment?.calendar ?? resolvedLocalCalendar(),
				plan.weekStartsOn ?? environment?.weekStartsOn
			);
		case 'quantized': {
			const quantum = plan.quantumMilliseconds;
			const anchor = resolvePlanNumber(plan.anchorMilliseconds, inputs);
			if (plan.boundary === 'half-expand-increasing') {
				const current = roundHalfExpand((sample - anchor) / quantum);
				const threshold = anchor + (current + 0.5) * quantum;
				return Math.max(sample + 1, current < 0 ? Math.floor(threshold) + 1 : Math.ceil(threshold));
			}
			if (plan.boundary === 'half-expand-decreasing') {
				const current = roundHalfExpand((anchor - sample) / quantum);
				const threshold = anchor - (current - 0.5) * quantum;
				return Math.max(sample + 1, current > 0 ? Math.floor(threshold) + 1 : Math.ceil(threshold));
			}
			if (plan.boundary === 'round-increasing') {
				const current = Math.round((sample - anchor) / quantum);
				return Math.max(sample + 1, Math.ceil(anchor + (current + 0.5) * quantum));
			}
			if (plan.boundary === 'round-decreasing') {
				const current = Math.round((anchor - sample) / quantum);
				return Math.max(sample + 1, Math.floor(anchor - (current - 0.5) * quantum) + 1);
			}
			if (plan.boundary === 'trunc-increasing') {
				const current = Math.trunc((sample - anchor) / quantum);
				const threshold =
					current >= 0
						? Math.ceil(anchor + (current + 1) * quantum)
						: Math.floor(anchor + current * quantum) + 1;
				return Math.max(sample + 1, threshold);
			}
			if (plan.boundary === 'trunc-decreasing') {
				const current = Math.trunc((anchor - sample) / quantum);
				const threshold =
					current > 0
						? Math.floor(anchor - current * quantum) + 1
						: Math.ceil(anchor - (current - 1) * quantum);
				return Math.max(sample + 1, threshold);
			}
			const offset = positiveModulo(sample - anchor, quantum);
			return sample + (offset === 0 ? quantum : quantum - offset);
		}
	}
}

function validatePlanNumber(value: unknown, role: string): TimePlanNumber {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (
		value &&
		typeof value === 'object' &&
		Object.keys(value).length === 1 &&
		Number.isInteger((value as { binding?: unknown }).binding) &&
		((value as { binding: number }).binding ?? -1) >= 0 &&
		(value as { binding: number }).binding < 256
	)
		return Object.freeze({ binding: (value as { binding: number }).binding });
	throw new TypeError(`A time change plan requires a finite ${role} or bounded binding`);
}

function resolvePlanNumber(value: TimePlanNumber, inputs: readonly number[]): number {
	if (typeof value === 'number') return value;
	const input = inputs[value.binding];
	if (typeof input !== 'number' || !Number.isFinite(input))
		throw new TypeError(`Time plan binding ${value.binding} requires a finite numeric input`);
	return input;
}

function explicitDeadline(
	policy: Exclude<TimeUpdatePolicy, true | 'disabled'>,
	sample: number,
	environment?: Omit<TimeEnvironment, 'clock'>
): number | undefined {
	if (policy === 'auto') return undefined;
	if (policy in fixedPolicyMilliseconds)
		return sample + fixedPolicyMilliseconds[policy as keyof typeof fixedPolicyMilliseconds];
	if (policy === 'day' || policy === 'week' || policy === 'month' || policy === 'year')
		return nextCalendarBoundary(
			sample,
			policy,
			environment?.timeZone ?? resolvedLocalTimeZone(),
			environment?.calendar ?? resolvedLocalCalendar(),
			environment?.weekStartsOn
		);
	return undefined;
}

function positiveModulo(value: number, divisor: number): number {
	return ((value % divisor) + divisor) % divisor;
}

function roundHalfExpand(value: number): number {
	return value < 0 ? Math.ceil(value - 0.5) : Math.floor(value + 0.5);
}

function resolvedLocalTimeZone(): string {
	const zone = intl.DateTimeFormat(undefined).resolvedOptions().timeZone;
	if (!zone) throw new Error('Calendar time updates require a determinate time zone');
	return zone;
}

function resolvedLocalCalendar(): string {
	const calendar = intl.DateTimeFormat(undefined).resolvedOptions().calendar;
	if (!calendar) throw new Error('Calendar time updates require a determinate calendar');
	return calendar;
}

/** Finds a calendar boundary by searching for the first changed local calendar bucket. */
function nextCalendarBoundary(
	sample: number,
	unit: 'day' | 'week' | 'month' | 'year',
	timeZone: string,
	calendar?: string,
	weekStartsOn = 0
): number {
	const formatter = intl.DateTimeFormat('en-US-u-nu-latn', {
		timeZone,
		...(calendar && unit !== 'week' ? { calendar } : {}),
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		weekday: unit === 'week' ? 'short' : undefined
	});
	const bucket = (instant: number): string => {
		const parts = Object.fromEntries(
			formatter.formatToParts(instant).map((part) => [part.type, part.value])
		);
		if (unit === 'year') return String(parts.year);
		if (unit === 'month') return `${parts.year}-${parts.month}`;
		if (unit === 'week') {
			const date = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
			const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
				String(parts.weekday)
			);
			return String(date - positiveModulo(Math.max(weekday, 0) - weekStartsOn, 7) * 86_400_000);
		}
		return `${parts.year}-${parts.month}-${parts.day}`;
	};
	const current = bucket(sample);
	let low = sample + 1;
	let high =
		sample + (unit === 'year' ? 370 : unit === 'month' ? 32 : unit === 'week' ? 8 : 2) * 86_400_000;
	while (bucket(high) === current) high += 32 * 86_400_000;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if (bucket(middle) === current) low = middle + 1;
		else high = middle;
	}
	return low;
}

function assertOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): void {
	const allowed = new Set(keys);
	if (Object.keys(value).some((key) => !allowed.has(key)))
		throw new TypeError('A time change plan contains unsupported data');
}
