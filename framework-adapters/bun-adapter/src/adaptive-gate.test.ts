import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BunRequestGate } from './adaptive-gate.js';

const probe = vi.hoisted(() => ({ lag: 4, create: vi.fn(), disable: vi.fn() }));
vi.mock('node:perf_hooks', () => ({
	performance: { now: () => Date.now() },
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
});
afterEach(() => vi.useRealTimers());

function drive(gate: BunRequestGate, duration: number, immediate = 100, scheduled = 200) {
	const decisions: boolean[] = [];
	for (let elapsed = 0; elapsed < duration; elapsed += 250) {
		const enabled = gate.shouldSchedule();
		decisions.push(enabled);
		probe.lag = enabled ? 2 : 4;
		for (let request = 0; request < (enabled ? scheduled : immediate); request++) {
			gate.observeRequest();
		}
		vi.advanceTimersByTime(250);
	}
	return decisions;
}

it('keeps sparse requests immediate without allocating a monitor or timer', () => {
	const gate = new BunRequestGate(() => 0);
	for (let request = 0; request < 12; request++) {
		expect(gate.observeRequest()).toBeUndefined();
		expect(gate.shouldSchedule()).toBe(false);
		vi.advanceTimersByTime(500);
	}
	expect(probe.create).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it('retains higher-capacity lower-lag scheduling and periodically rechecks it', () => {
	const gate = new BunRequestGate(() => 0);
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
	const gate = new BunRequestGate(() => 0);
	drive(gate, 2250, 100, 80);
	expect(gate.shouldSchedule()).toBe(false);
	expect(drive(gate, 1750, 100, 80)).not.toContain(true);
});

it('does not mistake rising unscheduled capacity for a benefit from scheduling', () => {
	const gate = new BunRequestGate(() => 0);
	drive(gate, 1750, 100, 200);
	// The trial beat the first control but loses to the stronger following control.
	drive(gate, 500, 250, 200);
	expect(gate.shouldSchedule()).toBe(false);
});

it('reconsiders a previously beneficial policy after the workload changes', () => {
	const gate = new BunRequestGate(() => 0);
	drive(gate, 3500);
	expect(gate.shouldSchedule()).toBe(true);
	// A partially collected window may still contain completions from the previous workload.
	expect(drive(gate, 1500, 100, 80)).toContain(false);
	drive(gate, 10_000, 100, 80);
	const decisions = drive(gate, 8000, 100, 80);
	expect(decisions.filter(Boolean).length).toBeLessThan(decisions.length / 2);
});

it('does not count starts whose native bodies remain pending as departures', () => {
	let pending = 0;
	const gate = new BunRequestGate(() => pending);
	for (let window = 0; window < 24; window++) {
		for (let request = 0; request < 100; request++) {
			pending++;
			gate.observeRequest();
		}
		vi.advanceTimersByTime(250);
		expect(gate.shouldSchedule()).toBe(false);
	}
});

it('resets an interrupted trial after traffic becomes quiet', () => {
	const gate = new BunRequestGate(() => 0);
	drive(gate, 1000);
	vi.advanceTimersByTime(500);
	expect(gate.shouldSchedule()).toBe(false);
	drive(gate, 3500);
	expect(gate.shouldSchedule()).toBe(true);
});

it('lets lower-volume controls accumulate enough completed responses before a trial', () => {
	const gate = new BunRequestGate(() => 0);
	expect(drive(gate, 750, 50, 100)).not.toContain(true);
	expect(gate.shouldSchedule()).toBe(false);
	expect(drive(gate, 750, 50, 100)).toContain(true);
});

it('reassesses increased lag before the routine recheck deadline', () => {
	const gate = new BunRequestGate(() => 0);
	drive(gate, 3500);
	expect(gate.shouldSchedule()).toBe(true);
	probe.lag = 6;
	const decisions: boolean[] = [];
	for (let window = 0; window < 3; window++) {
		for (let request = 0; request < 200; request++) {
			gate.observeRequest();
		}
		vi.advanceTimersByTime(250);
		decisions.push(gate.shouldSchedule());
	}
	expect(decisions).toContain(false);
});
