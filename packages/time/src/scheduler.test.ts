import { computed } from '@exactjs/reactive';
import {
	createFrameworkComponentDomain,
	withComponentDomain
} from '@exactjs/core/framework/component-domains';
import { describe, expect, it } from 'vitest';
import { createTimeActivation } from './activation.js';
import { schedulerForClock } from './scheduler.js';
import { createManualTimeClock, inspectTimeClock } from './testing.js';

describe('shared time scheduler', () => {
	it('uses one request-owned server sample for matching default clock reads', () => {
		const domain = createFrameworkComponentDomain({
			executionRoot: 'ssr-test',
			wallClockSnapshot: 42_000
		});
		const first = withComponentDomain(domain, () =>
			createTimeActivation('second', { protocol: 1, kind: 'continuous' })
		);
		const second = withComponentDomain(domain, () =>
			createTimeActivation('second', { protocol: 1, kind: 'continuous' })
		);
		expect(first.readEpochMilliseconds()).toBe(42_000);
		expect(second.readEpochMilliseconds()).toBe(42_000);
	});

	it('adopts a finite plan observed through a materialized clock-derived alias', async () => {
		const clock = createManualTimeClock(9_100);
		const activation = createTimeActivation('auto', { protocol: 1, kind: 'continuous' }, clock);
		activation.mount(clock);
		activation.configure(activation.policy, {
			protocol: 1,
			kind: 'quantized',
			quantumMilliseconds: 1_000,
			anchorMilliseconds: 10_250,
			boundary: 'ceil-decreasing'
		});
		await Promise.resolve();
		expect(clock.nextDeadline?.epochMilliseconds).toBe(9_250);
		activation.configure(activation.policy, activation.plan);
		await Promise.resolve();
		expect(clock.nextDeadline?.epochMilliseconds).toBe(9_250);
		activation.dispose();
	});

	it('refreshes compact reactive plan inputs without replacing plan structure', async () => {
		const clock = createManualTimeClock(9_100);
		const activation = createTimeActivation(
			'auto',
			{
				protocol: 1,
				kind: 'quantized',
				quantumMilliseconds: 1_000,
				anchorMilliseconds: { binding: 0 },
				boundary: 'ceil-decreasing'
			},
			clock,
			[10_250]
		);
		activation.mount(clock);
		await Promise.resolve();
		expect(clock.nextDeadline?.epochMilliseconds).toBe(9_250);
		activation.readEpochMilliseconds([10_750]);
		await Promise.resolve();
		expect(clock.nextDeadline?.epochMilliseconds).toBe(9_750);
		activation.dispose();
	});

	it('shares one timer, publishes due samples, and releases the final timer', async () => {
		const clock = createManualTimeClock(100);
		const plan = { protocol: 1, kind: 'continuous' } as const;
		const first = createTimeActivation('second', plan, clock);
		const second = createTimeActivation('second', plan, clock);
		const firstValue = computed(() => first.readEpochMilliseconds());
		const secondValue = computed(() => second.readEpochMilliseconds());
		first.mount(clock);
		second.mount(clock);
		await Promise.resolve();

		expect(clock.pendingTimerCount).toBe(1);
		expect(schedulerForClock(clock).activeCount).toBe(2);
		clock.advance(1_000);
		clock.runDue();
		await Promise.resolve();
		expect(firstValue.get()).toBe(1_100);
		expect(secondValue.get()).toBe(1_100);

		first.dispose();
		second.dispose();
		await Promise.resolve();
		expect(clock.pendingTimerCount).toBe(0);
	});

	it('freezes disabled samples and coalesces restart', async () => {
		const clock = createManualTimeClock(0);
		const activation = createTimeActivation('second', { protocol: 1, kind: 'continuous' }, clock);
		activation.mount(clock);
		await Promise.resolve();
		activation.configure('disabled');
		await Promise.resolve();
		clock.advance(5_000);
		expect(activation.readEpochMilliseconds()).toBe(0);
		expect(clock.pendingTimerCount).toBe(0);

		activation.configure('second');
		await Promise.resolve();
		expect(activation.readEpochMilliseconds()).toBe(5_000);
		expect(clock.pendingTimerCount).toBe(1);
	});

	it('adapts the scheduled cadence when a relative-time phase changes', async () => {
		const clock = createManualTimeClock(58_500);
		const activation = createTimeActivation(
			'auto',
			{
				protocol: 1,
				kind: 'threshold',
				thresholdMilliseconds: 60_000,
				before: {
					protocol: 1,
					kind: 'quantized',
					quantumMilliseconds: 1_000,
					anchorMilliseconds: 0,
					boundary: 'floor-increasing'
				},
				after: {
					protocol: 1,
					kind: 'quantized',
					quantumMilliseconds: 60_000,
					anchorMilliseconds: 0,
					boundary: 'floor-increasing'
				}
			},
			clock
		);
		activation.mount(clock);
		await Promise.resolve();
		expect(clock.nextDeadline?.epochMilliseconds).toBe(59_000);
		clock.advance(500);
		clock.runDue();
		await Promise.resolve();
		expect(clock.nextDeadline?.epochMilliseconds).toBe(60_000);
		clock.advance(1_000);
		clock.runDue();
		await Promise.resolve();
		expect(clock.nextDeadline?.epochMilliseconds).toBe(120_000);
		activation.dispose();
	});

	it('coalesces suspension drift and exposes bounded scheduler inspection', async () => {
		const clock = createManualTimeClock(0);
		const activation = createTimeActivation('second', { protocol: 1, kind: 'continuous' }, clock);
		activation.mount(clock);
		await Promise.resolve();
		clock.advance(5_000);
		clock.wake();
		await Promise.resolve();
		const summary = inspectTimeClock(clock);
		expect(summary.activeRegistrations).toBe(1);
		expect(summary.coalescedBoundaries).toBe(1);
		expect(summary.policies).toEqual({ second: 1 });
		expect(clock.pendingTimerCount).toBe(1);
		activation.dispose();
	});

	it('defers hydration activation until the adoption cycle settles', async () => {
		const clock = createManualTimeClock(100);
		const activation = createTimeActivation('second', { protocol: 1, kind: 'continuous' }, clock);
		clock.advance(900);
		activation.mount(clock, { deferInitialPublish: true });
		expect(inspectTimeClock(clock).activeRegistrations).toBe(0);
		expect(clock.pendingTimerCount).toBe(0);
		await Promise.resolve();
		expect(activation.readEpochMilliseconds()).toBe(1_000);
		expect(inspectTimeClock(clock).activeRegistrations).toBe(1);
		await Promise.resolve();
		expect(clock.pendingTimerCount).toBe(1);
		activation.dispose();
	});

	it('moves a mounted range when its reactive clock environment changes', async () => {
		const first = createManualTimeClock(0);
		const second = createManualTimeClock(10_000);
		const activation = createTimeActivation('second', { protocol: 1, kind: 'continuous' }, first);
		activation.mount(first);
		await Promise.resolve();
		activation.configureEnvironment({ clock: second, timeZone: 'UTC', calendar: 'gregory' });
		await Promise.resolve();
		expect(first.pendingTimerCount).toBe(0);
		expect(inspectTimeClock(first).activeRegistrations).toBe(0);
		expect(inspectTimeClock(second).activeRegistrations).toBe(1);
		expect(activation.readEpochMilliseconds()).toBe(10_000);
		expect(second.nextDeadline?.epochMilliseconds).toBe(11_000);
		activation.dispose();
	});

	it('reschedules calendar plans when reactive zone and calendar axes change', async () => {
		const sample = Date.parse('2026-03-08T08:00:00.000Z');
		const clock = createManualTimeClock(sample);
		const activation = createTimeActivation(
			'auto',
			{ protocol: 1, kind: 'calendar', unit: 'day' },
			clock
		);
		activation.mount({ clock, timeZone: 'UTC', calendar: 'gregory' });
		await Promise.resolve();
		expect(clock.nextDeadline?.epochMilliseconds).toBe(Date.parse('2026-03-09T00:00:00.000Z'));
		activation.configureEnvironment({
			clock,
			timeZone: 'America/Los_Angeles',
			calendar: 'gregory'
		});
		await Promise.resolve();
		expect(clock.nextDeadline?.epochMilliseconds).toBe(Date.parse('2026-03-09T07:00:00.000Z'));
		activation.dispose();
	});

	it('rejects invalid reactive calendar axes before scheduling them', () => {
		const clock = createManualTimeClock(0);
		const activation = createTimeActivation(
			'auto',
			{ protocol: 1, kind: 'calendar', unit: 'day' },
			clock
		);
		expect(() => activation.configureEnvironment({ clock, timeZone: 'Not/A_Zone' })).toThrow();
		expect(() => activation.configureEnvironment({ clock, weekStartsOn: 7 })).toThrow(/week start/);
	});

	it('keeps one timer and bounded scheduler state for ten thousand mixed deadlines', async () => {
		const clock = createManualTimeClock(0);
		const activations = Array.from({ length: 10_000 }, (_, index) => {
			const activation = createTimeActivation(
				'auto',
				{
					protocol: 1,
					kind: 'quantized',
					quantumMilliseconds: 1_000,
					anchorMilliseconds: index % 1_000,
					boundary: 'floor-increasing'
				},
				clock
			);
			activation.mount(clock);
			return activation;
		});
		await Promise.resolve();
		expect(clock.pendingTimerCount).toBe(1);
		expect(inspectTimeClock(clock).activeRegistrations).toBe(10_000);
		clock.advance(1);
		clock.runDue();
		await Promise.resolve();
		expect(clock.pendingTimerCount).toBe(1);
		for (const activation of activations) activation.dispose();
		await Promise.resolve();
		expect(clock.pendingTimerCount).toBe(0);
		expect(inspectTimeClock(clock).activeRegistrations).toBe(0);
	});
});
