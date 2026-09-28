import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdaptiveRequestGate } from './adaptive-gate.js';

const probe = vi.hoisted(() => ({ lag: 4, utilization: 1, create: vi.fn(), disable: vi.fn() }));
vi.mock('node:timers', () => ({
	setImmediate: (callback: () => void) => globalThis.setImmediate(callback),
	clearImmediate: (timer: ReturnType<typeof setImmediate>) => globalThis.clearImmediate(timer)
}));
vi.mock('node:perf_hooks', () => ({
	performance: {
		now: () => Date.now(),
		eventLoopUtilization: () => ({ idle: 0, active: 0, utilization: probe.utilization })
	},
	monitorEventLoopDelay: () => {
		probe.create();
		return { enable() {}, disable: probe.disable, reset() {}, percentile: () => probe.lag * 1e6 };
	}
}));

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(0);
	vi.clearAllMocks();
	probe.lag = 4;
	probe.utilization = 1;
});
afterEach(() => vi.useRealTimers());

function drive(gate: AdaptiveRequestGate, duration: number, immediate = 100, scheduled = 200) {
	const decisions: boolean[] = [];
	for (let elapsed = 0; elapsed < duration; elapsed += 250) {
		const enabled = gate.shouldSchedule();
		decisions.push(enabled);
		probe.lag = enabled ? 2 : 4;
		for (let request = 0; request < (enabled ? scheduled : immediate); request++) {
			const epoch = gate.observeRequest();
			if (epoch !== undefined) gate.observeCompletion(epoch);
		}
		vi.advanceTimersByTime(250);
	}
	return decisions;
}

it('keeps sparse requests immediate without allocating a monitor or timer', () => {
	const gate = new AdaptiveRequestGate();
	for (let request = 0; request < 12; request++) {
		expect(gate.observeRequest()).toBeUndefined();
		expect(gate.shouldSchedule()).toBe(false);
		vi.advanceTimersByTime(500);
	}
	expect(probe.create).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it('retains higher-capacity lower-lag scheduling and periodically rechecks it', () => {
	const gate = new AdaptiveRequestGate();
	drive(gate, 3500);
	expect(gate.shouldSchedule()).toBe(true);
	expect(drive(gate, 20_000).every(Boolean)).toBe(true);
	expect(drive(gate, 12_000)).toContain(false);
	drive(gate, 3500);
	expect(gate.shouldSchedule()).toBe(true);
	vi.advanceTimersByTime(500);
	expect(gate.shouldSchedule()).toBe(false);
	expect(probe.disable).toHaveBeenCalledOnce();
	expect(vi.getTimerCount()).toBe(0);
});

it('backs off when lag improves but completion capacity does not', () => {
	const gate = new AdaptiveRequestGate();
	drive(gate, 2250, 100, 80);
	expect(gate.shouldSchedule()).toBe(false);
	expect(drive(gate, 1750, 100, 80)).not.toContain(true);
});

it('does not mistake rising unscheduled capacity for a benefit from scheduling', () => {
	const gate = new AdaptiveRequestGate();
	drive(gate, 1750, 100, 200);
	// The trial beat the first control but loses to the stronger following control.
	drive(gate, 500, 250, 200);
	expect(gate.shouldSchedule()).toBe(false);
});

it('reconsiders a previously beneficial policy after the workload changes', () => {
	const gate = new AdaptiveRequestGate();
	drive(gate, 3500);
	expect(gate.shouldSchedule()).toBe(true);
	// A partially collected window may still contain completions from the previous workload.
	expect(drive(gate, 1500, 100, 80)).toContain(false);
	drive(gate, 10_000, 100, 80);
	const decisions = drive(gate, 8000, 100, 80);
	expect(decisions.filter(Boolean).length).toBeLessThan(decisions.length / 2);
});

it('does not credit completions from earlier observation windows to new trials', () => {
	const gate = new AdaptiveRequestGate();
	for (let request = 0; request < 4; request++) gate.observeRequest();
	const oldEpoch = gate.observeRequest()!;
	for (let window = 0; window < 24; window++) {
		for (let request = 0; request < 100; request++) {
			gate.observeRequest();
			gate.observeCompletion(oldEpoch);
		}
		vi.advanceTimersByTime(250);
		expect(gate.shouldSchedule()).toBe(false);
	}
});

it('resets an interrupted trial after traffic becomes quiet', () => {
	const gate = new AdaptiveRequestGate();
	drive(gate, 1000);
	vi.advanceTimersByTime(500);
	expect(gate.shouldSchedule()).toBe(false);
	drive(gate, 3500);
	expect(gate.shouldSchedule()).toBe(true);
});

it('lets lower-volume controls accumulate enough completed responses before a trial', () => {
	const gate = new AdaptiveRequestGate();
	expect(drive(gate, 750, 50, 100)).not.toContain(true);
	expect(gate.shouldSchedule()).toBe(false);
	expect(drive(gate, 750, 50, 100)).toContain(true);
});

it('reassesses increased lag before the routine recheck deadline', () => {
	const gate = new AdaptiveRequestGate();
	drive(gate, 3500);
	expect(gate.shouldSchedule()).toBe(true);
	probe.lag = 6;
	const decisions: boolean[] = [];
	for (let window = 0; window < 10; window++) {
		for (let request = 0; request < 200; request++) {
			const epoch = gate.observeRequest();
			if (epoch !== undefined) gate.observeCompletion(epoch);
		}
		vi.advanceTimersByTime(250);
		decisions.push(gate.shouldSchedule());
	}
	expect(decisions).toContain(false);
});

it('retains a responsive policy when demand falls, then reassesses when headroom disappears', () => {
	const gate = new AdaptiveRequestGate();
	drive(gate, 3500);
	expect(gate.shouldSchedule()).toBe(true);
	probe.utilization = 0.7;
	// Falling completion rate and the routine deadline must not interrupt a healthy, idle loop.
	expect(drive(gate, 40_000, 100, 80).every(Boolean)).toBe(true);
	probe.utilization = 1;
	expect(drive(gate, 3500, 100, 80)).toContain(false);
});

it('does not let spare capacity conceal a loss of responsiveness', () => {
	const gate = new AdaptiveRequestGate();
	drive(gate, 3500);
	probe.utilization = 0.5;
	probe.lag = 6;
	const decisions: boolean[] = [];
	for (let window = 0; window < 10; window++) {
		for (let request = 0; request < 200; request++) {
			const epoch = gate.observeRequest();
			if (epoch !== undefined) gate.observeCompletion(epoch);
		}
		vi.advanceTimersByTime(250);
		decisions.push(gate.shouldSchedule());
	}
	expect(decisions).toContain(false);
});

it('retains low-lag scheduling at unchanged demand when admitted work completes with headroom', () => {
	const gate = new AdaptiveRequestGate();
	probe.utilization = 0.7;
	drive(gate, 3500, 100, 100);
	expect(gate.shouldSchedule()).toBe(true);
	expect(drive(gate, 40_000, 100, 100).every(Boolean)).toBe(true);
});

it('requires completion evidence even when the event loop has spare capacity', () => {
	const gate = new AdaptiveRequestGate();
	probe.utilization = 0.7;
	for (let window = 0; window < 9; window++) {
		const scheduled = gate.shouldSchedule();
		probe.lag = scheduled ? 2 : 4;
		for (let request = 0; request < 100; request++) {
			const epoch = gate.observeRequest();
			if (epoch !== undefined && (!scheduled || request < 80)) gate.observeCompletion(epoch);
		}
		vi.advanceTimersByTime(250);
	}
	expect(gate.shouldSchedule()).toBe(false);
});

it('ignores an isolated busy window and clears its reassessment streak on recovery', () => {
	const gate = new AdaptiveRequestGate();
	probe.utilization = 0.7;
	drive(gate, 40_000);
	for (let repetition = 0; repetition < 4; repetition++) {
		probe.utilization = 1;
		expect(drive(gate, 750, 100, 80).every(Boolean)).toBe(true);
		probe.utilization = 0.7;
		expect(drive(gate, 1500, 100, 80).every(Boolean)).toBe(true);
	}
});

it('restores prompt capacity reassessment after sustained busy operation uses up the grace period', () => {
	const gate = new AdaptiveRequestGate();
	probe.utilization = 0.7;
	drive(gate, 4500);
	probe.utilization = 1;
	expect(drive(gate, 3000).every(Boolean)).toBe(true);
	expect(drive(gate, 1500, 100, 80)).toContain(false);
});

// Advance request work without yielding fake timers, modeling one overloaded I/O turn.
it.each(['baseline', 'following-control'])(
	'aborts a disruptive %s recheck and later disables an unhelpful policy',
	(phase) => {
		const gate = new AdaptiveRequestGate();
		drive(gate, 3500);
		expect(gate.shouldSchedule()).toBe(true);
		for (let elapsed = 0; gate.shouldSchedule() && elapsed < 40_000; elapsed += 250)
			drive(gate, 250);
		expect(gate.shouldSchedule()).toBe(false);
		if (phase === 'following-control') {
			drive(gate, 750);
			expect(gate.shouldSchedule()).toBe(true);
			for (let elapsed = 0; gate.shouldSchedule() && elapsed < 3000; elapsed += 250)
				drive(gate, 250);
			expect(gate.shouldSchedule()).toBe(false);
		}
		for (let request = 0; request < 8; request++) {
			const epoch = gate.observeRequest();
			if (epoch !== undefined) gate.observeCompletion(epoch);
			expect(gate.shouldSchedule()).toBe(false);
			vi.setSystemTime(Date.now() + 1);
		}
		const epoch = gate.observeRequest();
		if (epoch !== undefined) gate.observeCompletion(epoch);
		expect(gate.shouldSchedule()).toBe(true);
		expect(vi.getTimerCount()).toBe(1);
		expect(drive(gate, 3000).every(Boolean)).toBe(true);
		drive(gate, 10_000, 100, 80);
		expect(drive(gate, 4000, 100, 80).filter(Boolean).length).toBeLessThan(8);
		vi.advanceTimersByTime(1000);
		expect(vi.getTimerCount()).toBe(0);
	}
);

it('allows a responsive immediate recheck to finish and releases its turn observer', () => {
	const gate = new AdaptiveRequestGate();
	drive(gate, 3500);
	for (let elapsed = 0; gate.shouldSchedule() && elapsed < 40_000; elapsed += 250) drive(gate, 250);
	expect(gate.shouldSchedule()).toBe(false);
	probe.lag = 1;
	for (let request = 0; request < 200; request++) {
		const epoch = gate.observeRequest();
		if (epoch !== undefined) gate.observeCompletion(epoch);
	}
	vi.advanceTimersByTime(250);
	expect(gate.shouldSchedule()).toBe(false);
	expect(vi.getTimerCount()).toBe(1);
	// A completed probe does not schedule a new observer on subsequent immediate traffic.
	const epoch = gate.observeRequest();
	if (epoch !== undefined) gate.observeCompletion(epoch);
	expect(vi.getTimerCount()).toBe(1);
	vi.advanceTimersByTime(1000);
	expect(vi.getTimerCount()).toBe(0);
});
