import { computed, flushSync, reactive } from '@exactjs/reactive';
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

	it('tracks a reactive policy without recreating the activation', async () => {
		const clock = createManualTimeClock(0);
		const state = reactive({ running: false });
		const policy = computed(() => (state.running ? 'second' : 'disabled'));
		const activation = createTimeActivation(policy, { protocol: 1, kind: 'continuous' }, clock);
		activation.mount(clock);
		await Promise.resolve();
		expect(clock.pendingTimerCount).toBe(0);

		state.running = true;
		flushSync();
		await Promise.resolve();
		expect(clock.pendingTimerCount).toBe(1);

		activation.dispose();
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
		flushSync();
		expect(activation.readEpochMilliseconds()).toBe(100);
		expect(inspectTimeClock(clock).activeRegistrations).toBe(0);
		expect(clock.pendingTimerCount).toBe(0);
		await Promise.resolve();
		flushSync();
		expect(activation.readEpochMilliseconds()).toBe(1_000);
		expect(inspectTimeClock(clock).activeRegistrations).toBe(1);
		await Promise.resolve();
		expect(clock.pendingTimerCount).toBe(1);
		activation.dispose();
	});

	it('fences provider changes and cancellation before the hydration publication turn', async () => {
		const first = createManualTimeClock(100);
		const second = createManualTimeClock(9000);
		const activation = createTimeActivation('second', { protocol: 1, kind: 'continuous' }, first);
		activation.mount(first, { deferInitialPublish: true });
		activation.configureEnvironment({ clock: second });
		activation.configure('disabled');
		activation.configure('second');
		flushSync();
		expect(activation.readEpochMilliseconds()).toBe(100);
		expect(first.pendingTimerCount).toBe(0);
		expect(second.pendingTimerCount).toBe(0);
		activation.dispose();
		await Promise.resolve();
		flushSync();
		expect(activation.readEpochMilliseconds()).toBe(100);
		expect(first.pendingTimerCount).toBe(0);
		expect(second.pendingTimerCount).toBe(0);
		expect(inspectTimeClock(first).activeRegistrations).toBe(0);
		expect(inspectTimeClock(second).activeRegistrations).toBe(0);
	});

	it.each(['auto', 'disabled'] as const)(
		'selects an unmounted provider clock with %s policy',
		(policy) => {
			const first = createManualTimeClock(100);
			const second = createManualTimeClock(2750);
			const activation = createTimeActivation(policy, { protocol: 1, kind: 'continuous' }, first);
			activation.configureEnvironment({ clock: second });
			expect(activation.readEpochMilliseconds()).toBe(policy === 'disabled' ? 100 : 2750);
			second.advance(500);
			activation.configureEnvironment({ clock: second, timeZone: 'UTC' });
			expect(activation.readEpochMilliseconds()).toBe(policy === 'disabled' ? 100 : 2750);
			activation.configureEnvironment({ clock: first });
			expect(activation.readEpochMilliseconds()).toBe(100);
			expect(first.pendingTimerCount).toBe(0);
			expect(second.pendingTimerCount).toBe(0);
			expect(inspectTimeClock(first).activeRegistrations).toBe(0);
			expect(inspectTimeClock(second).activeRegistrations).toBe(0);
			activation.dispose();
		}
	);

	it('retains the server sample when configuring a hydration provider before mount', async () => {
		const domain = createFrameworkComponentDomain({
			executionRoot: 'hydration-test',
			inspectionActivation: 'hydration',
			wallClockSnapshot: 1000
		});
		const clock = createManualTimeClock(2750);
		const activation = withComponentDomain(domain, () =>
			createTimeActivation('second', { protocol: 1, kind: 'continuous' })
		);
		activation.configureEnvironment({ clock });
		expect(activation.readEpochMilliseconds()).toBe(1000);
		expect(clock.pendingTimerCount).toBe(0);
		activation.mount(clock, { deferInitialPublish: true });
		expect(activation.readEpochMilliseconds()).toBe(1000);
		await Promise.resolve();
		flushSync();
		expect(activation.readEpochMilliseconds()).toBe(2750);
		activation.dispose();
	});

	it.each(['second', 'disabled'] as const)(
		'adopts a custom provider sample once with %s policy',
		async (policy) => {
			const domain = createFrameworkComponentDomain({
				executionRoot: 'provider-hydration',
				inspectionActivation: 'hydration',
				wallClockSnapshot: 1000
			});
			const clock = createManualTimeClock(9000);
			const activation = withComponentDomain(domain, () =>
				createTimeActivation(policy, { protocol: 1, kind: 'continuous' })
			);
			activation.configureEnvironment({ clock }, 2750);
			expect(activation.readEpochMilliseconds()).toBe(2750);
			activation.configureEnvironment({ clock, timeZone: 'UTC' }, 4000);
			expect(activation.readEpochMilliseconds()).toBe(2750);
			activation.mount(clock, { deferInitialPublish: true });
			flushSync();
			expect(activation.readEpochMilliseconds()).toBe(2750);
			expect(clock.pendingTimerCount).toBe(0);
			await Promise.resolve();
			flushSync();
			expect(activation.readEpochMilliseconds()).toBe(policy === 'disabled' ? 2750 : 9000);
			activation.configureEnvironment({ clock }, 10);
			expect(activation.readEpochMilliseconds()).toBe(policy === 'disabled' ? 2750 : 9000);
			activation.dispose();
			await Promise.resolve();
			flushSync();
			expect(clock.pendingTimerCount).toBe(0);
		}
	);

	it.each([NaN, Infinity, -Infinity])(
		'rejects invalid provider sample %s before changing ownership',
		(sample) => {
			const first = createManualTimeClock(100);
			const next = createManualTimeClock(2750);
			const activation = createTimeActivation('second', { protocol: 1, kind: 'continuous' }, first);
			expect(() => activation.configureEnvironment({ clock: next }, sample)).toThrow(/finite/);
			expect(activation.readEpochMilliseconds()).toBe(100);
			activation.configureEnvironment({ clock: first }, 250);
			expect(activation.readEpochMilliseconds()).toBe(250);
			activation.dispose();
			expect(first.pendingTimerCount).toBe(0);
			expect(next.pendingTimerCount).toBe(0);
		}
	);

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

it.each(['auto', 'disabled'] as const)(
	'restarts completed plans on changed anchors while respecting %s policy',
	async (policy) => {
		const clock = createManualTimeClock(5000);
		const activation = createTimeActivation(
			policy,
			{
				protocol: 1,
				kind: 'threshold',
				thresholdMilliseconds: { binding: 0 },
				before: { protocol: 1, kind: 'complete' },
				after: { protocol: 1, kind: 'complete' }
			},
			clock,
			[1000]
		);
		try {
			activation.mount(clock);
			await Promise.resolve();
			expect(clock.pendingTimerCount).toBe(0);
			clock.advance(5000);
			activation.readEpochMilliseconds([11000]);
			await Promise.resolve();
			flushSync();
			await Promise.resolve();
			expect(activation.readEpochMilliseconds()).toBe(policy === 'disabled' ? 5000 : 10000);
			expect(clock.nextDeadline?.epochMilliseconds).toBe(policy === 'disabled' ? undefined : 11000);
		} finally {
			activation.dispose();
		}
		await Promise.resolve();
		expect(clock.pendingTimerCount).toBe(0);
	}
);
