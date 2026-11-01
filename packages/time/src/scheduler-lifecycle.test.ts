import { verifyTimeLifecycle } from '../../component-composition-corpus/test-support/time-lifecycle-journey.mjs';
import { describe, expect, it } from 'vitest';
import { createTimeActivation } from './activation.js';
import { inspectTimeClock } from './testing.js';

const plan = { protocol: 1, kind: 'continuous' } as const;
const settle = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

describe('time scheduler callback ownership', () => {
	it('shares source and native clock ownership controls', async () => {
		expect(await verifyTimeLifecycle({ createTimeActivation, inspectTimeClock })).toBe(true);
	});
	it.each(['timer', 'wake'] as const)(
		'fences a captured %s after final disposal and replacement',
		async (kind) => {
			let reads = 0;
			let timer: () => void = () => {};
			let wake: () => void = () => {};
			const clock = {
				now() {
					reads++;
					return { epochMilliseconds: 0 };
				},
				schedule(_: unknown, notify: () => void) {
					timer = notify;
					return () => {};
				},
				subscribeWake(notify: () => void) {
					wake = notify;
					return () => {};
				}
			};
			const first = createTimeActivation('second', plan, clock);
			first.mount(clock);
			await settle();
			const old = kind === 'timer' ? timer : wake;
			first.dispose();
			await settle();
			const before = reads;
			old();
			expect(reads).toBe(before);
			const next = createTimeActivation('second', plan, clock);
			try {
				next.mount(clock);
				await settle();
				const after = reads;
				old();
				expect(reads).toBe(after);
			} finally {
				next.dispose();
				await settle();
			}
		}
	);
	it('releases a wake subscription returned after reentrant disposal', async () => {
		let cancelled = 0;
		const clock = {
			now: () => ({ epochMilliseconds: 0 }),
			schedule: () => () => {},
			subscribeWake() {
				activation.dispose();
				return () => cancelled++;
			}
		};
		const activation = createTimeActivation('second', plan, clock);
		activation.mount(clock);
		await settle();
		expect(cancelled).toBe(1);
		expect(inspectTimeClock(clock).disabledRegistrations).toBe(0);
	});
	it('allows retry after failed subscription setup', async () => {
		let fail = true;
		let cancelled = 0;
		const clock = {
			now: () => ({ epochMilliseconds: 0 }),
			schedule: () => () => {},
			subscribeWake() {
				if (fail) throw Error('subscribe');
				return () => cancelled++;
			}
		};
		const activation = createTimeActivation('second', plan, clock);
		try {
			expect(() => activation.mount(clock)).toThrow('subscribe');
			fail = false;
			activation.mount(clock);
			await settle();
			expect(inspectTimeClock(clock).activeRegistrations).toBe(1);
		} finally {
			activation.dispose();
			await settle();
		}
		expect(cancelled).toBe(1);
	});
	it('attempts both final cleanup operations and retains the first failure', async () => {
		const failure = new Error('wake');
		let timerCancelled = 0;
		const clock = {
			now: () => ({ epochMilliseconds: 0 }),
			schedule: () => () => timerCancelled++,
			subscribeWake: () => () => {
				throw failure;
			}
		};
		const activation = createTimeActivation('second', plan, clock);
		activation.mount(clock);
		await settle();
		expect(() => activation.dispose()).toThrow(failure);
		expect(timerCancelled).toBe(1);
		expect(inspectTimeClock(clock).activeRegistrations).toBe(0);
		expect(() => activation.dispose()).not.toThrow();
		await settle();
	});
	it('preserves a failed post-connect clock read when cleanup also throws and allows retry', async () => {
		let reads = 0;
		let fail = true;
		const primary = Object.freeze(new Error('clock'));
		const clock = {
			now() {
				if (++reads === 2 && fail) throw primary;
				return { epochMilliseconds: 0 };
			},
			schedule: () => () => {},
			subscribeWake: () => () => {
				if (fail) throw Error('cleanup');
			}
		};
		const activation = createTimeActivation('second', plan, clock);
		try {
			expect(() => activation.mount(clock)).toThrow(primary);
			fail = false;
			activation.mount(clock);
			await settle();
			expect(inspectTimeClock(clock).activeRegistrations).toBe(1);
		} finally {
			activation.dispose();
			await settle();
		}
	});
	it('does not publish a clock getter result after reentrant disposal', async () => {
		let reads = 0;
		const clock = {
			now() {
				return {
					get epochMilliseconds() {
						if (++reads === 2) {
							activation.dispose();
							return 1000;
						}
						return 0;
					}
				};
			},
			schedule: () => () => {}
		};
		const activation = createTimeActivation('second', plan, clock);
		activation.mount(clock);
		await settle();
		expect(activation.readEpochMilliseconds()).toBe(0);
	});
	it('keeps replacement wake ownership when teardown reenters mounting', async () => {
		let subscriptions = 0;
		let cancelled = 0;
		let replacement: ReturnType<typeof createTimeActivation>;
		const clock = {
			now: () => ({ epochMilliseconds: 0 }),
			schedule: () => () => {},
			subscribeWake() {
				if (++subscriptions === 1) {
					first.dispose();
					replacement = createTimeActivation('second', plan, clock);
					replacement.mount(clock);
				}
				return () => cancelled++;
			}
		};
		const first = createTimeActivation('second', plan, clock);
		first.mount(clock);
		await settle();
		try {
			expect(cancelled).toBe(1);
			expect(inspectTimeClock(clock).activeRegistrations).toBe(1);
		} finally {
			replacement!.dispose();
			await settle();
		}
		expect(cancelled).toBe(2);
	});
	it('captures one timestamp for all selected registrations', async () => {
		let reads = 0;
		let epoch = 0;
		let fire: () => void = () => {};
		const clock = {
			now: () => ({
				get epochMilliseconds() {
					reads++;
					return epoch;
				}
			}),
			schedule(_: unknown, notify: () => void) {
				fire = notify;
				return () => {};
			}
		};
		const first = createTimeActivation('second', plan, clock);
		const second = createTimeActivation('second', plan, clock);
		try {
			first.mount(clock);
			second.mount(clock);
			await settle();
			reads = 0;
			epoch = 1000;
			fire();
			expect(reads).toBe(1);
			expect(first.readEpochMilliseconds()).toBe(1000);
			expect(second.readEpochMilliseconds()).toBe(1000);
		} finally {
			first.dispose();
			second.dispose();
			await settle();
		}
	});
	it('rejects a non-finite wake sample without consuming its deadline and recovers', async () => {
		let epoch = 0;
		let fire: () => void = () => {};
		let wake: () => void = () => {};
		const clock = {
			now: () => ({ epochMilliseconds: epoch }),
			schedule(_: unknown, notify: () => void) {
				fire = notify;
				return () => {};
			},
			subscribeWake(notify: () => void) {
				wake = notify;
				return () => {};
			}
		};
		const activation = createTimeActivation('second', plan, clock);
		try {
			activation.mount(clock);
			await settle();
			epoch = NaN;
			expect(fire).toThrow(/finite/);
			expect(activation.readEpochMilliseconds()).toBe(0);
			epoch = 1000;
			wake();
			expect(activation.readEpochMilliseconds()).toBe(1000);
		} finally {
			activation.dispose();
			await settle();
		}
	});
	it('recovers after failed connection while changing clocks', async () => {
		const original = { now: () => ({ epochMilliseconds: 0 }), schedule: () => () => {} };
		let fail = true;
		const next = {
			...original,
			subscribeWake() {
				if (fail) throw Error('connect');
				return () => {};
			}
		};
		const activation = createTimeActivation('second', plan, original);
		try {
			activation.mount(original);
			await settle();
			expect(() => activation.configureEnvironment(next)).toThrow('connect');
			fail = false;
			activation.mount(next);
			await settle();
			expect(inspectTimeClock(next).activeRegistrations).toBe(1);
			expect(inspectTimeClock(original).activeRegistrations).toBe(0);
		} finally {
			activation.dispose();
			await settle();
		}
	});
});
