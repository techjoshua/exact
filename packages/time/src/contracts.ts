import type { ReactiveValue } from '@exactjs/reactive';

/** Authored clock-update policy accepted by `time:update`. */
export type TimeUpdatePolicy =
	| true
	| 'auto'
	| 'millisecond'
	| 'second'
	| 'minute'
	| 'hour'
	| 'day'
	| 'week'
	| 'month'
	| 'year'
	| 'disabled';

/** Immutable instant representation used by clocks without requiring a Temporal polyfill. */
export interface TimeInstant {
	readonly epochMilliseconds: number;
}

/** One-shot host scheduling contract; clock object identity determines scheduler sharing. */
export interface TimeClock {
	now(): TimeInstant;
	schedule(deadline: TimeInstant, notify: () => void): () => void;
	/** Subscribes to host resume signals that may cross a deadline while timers are suspended. */
	subscribeWake?(notify: () => void): () => void;
}

/** Separately configured clock and calendar axes inherited by a time range. */
export interface TimeEnvironment {
	readonly clock: TimeClock;
	readonly timeZone?: string;
	readonly calendar?: string;
	/** Local week-start day using `0` for Sunday through `6` for Saturday. */
	readonly weekStartsOn?: number;
}

/** Finite compiler binding used when a plan coordinate follows reactive application input. */
export type TimePlanNumber = number | { readonly binding: number };

/** Supported data-only next-change plans emitted by the compiler. */
export type TimeChangePlan =
	| { readonly protocol: 1; readonly kind: 'continuous' }
	| {
			readonly protocol: 1;
			readonly kind: 'quantized';
			readonly quantumMilliseconds: number;
			readonly anchorMilliseconds: TimePlanNumber;
			readonly boundary:
				| 'floor-increasing'
				| 'ceil-decreasing'
				| 'round-increasing'
				| 'round-decreasing'
				| 'half-expand-increasing'
				| 'half-expand-decreasing'
				| 'trunc-increasing'
				| 'trunc-decreasing';
	  }
	| {
			readonly protocol: 1;
			readonly kind: 'calendar';
			readonly unit: 'day' | 'week' | 'month' | 'year';
			readonly timeZone?: string;
			readonly calendar?: string;
			readonly weekStartsOn?: number;
	  }
	| {
			readonly protocol: 1;
			readonly kind: 'earliest';
			readonly plans: readonly TimeChangePlan[];
	  }
	| {
			readonly protocol: 1;
			readonly kind: 'threshold';
			readonly thresholdMilliseconds: TimePlanNumber;
			readonly before: TimeChangePlan;
			readonly after: TimeChangePlan;
	  }
	| { readonly protocol: 1; readonly kind: 'complete' };

/** Compiler-prepared, range-local activation. Application code must not construct this value. */
export interface PreparedTimeActivation {
	readonly __exactTime: true;
	readonly policy: TimeUpdatePolicy | ReactiveValue<TimeUpdatePolicy>;
	readonly plan: TimeChangePlan;
	readonly inputs: readonly number[];
}
