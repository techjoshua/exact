import { nextFiniteInstant } from './instant-arithmetic.js';
import { verifyTimeValues } from '../../component-composition-corpus/test-support/time-lifecycle-journey.mjs';
import { describe, expect, it } from 'vitest';
import { validateTimeChangePlan, nextTimeChange } from './plan.js';
import { createTimeActivation } from './activation.js';
import { timeInstant, wallTimeClock } from './clocks.js';
import { createManualTimeClock, inspectTimeClock } from './testing.js';

const quantized = {
	protocol: 1,
	kind: 'quantized',
	quantumMilliseconds: 1000,
	anchorMilliseconds: 0,
	boundary: 'floor-increasing'
} as const;

// Type checking retains shallow readonly declarations while ordinary aliases remain writable.
function readonlyInstantControl(value: ReturnType<typeof timeInstant>): void {
	// @ts-expect-error The direct instant view remains readonly in TypeScript.
	value.epochMilliseconds = 1;
}
void readonlyInstantControl;

describe('captured Time value contracts', () => {
	it('shares captured input, ordinary observation and deadline controls', async () => {
		await verifyTimeValues({
			createTimeActivation,
			validateTimeChangePlan,
			timeInstant,
			wallTimeClock,
			createManualTimeClock
		});
	});
	it('validates and publishes the same plan boundary and binding index', () => {
		let reads = 0;
		const boundary = validateTimeChangePlan({
			...quantized,
			get boundary() {
				return ++reads === 1 ? 'floor-increasing' : 'unsupported';
			}
		});
		expect(reads).toBe(1);
		expect(boundary).toEqual(quantized);
		reads = 0;
		const binding = validateTimeChangePlan({
			...quantized,
			anchorMilliseconds: {
				get binding() {
					return ++reads === 1 ? 0 : 999;
				}
			}
		});
		expect(reads).toBe(1);
		expect(binding.kind === 'quantized' && binding.anchorMilliseconds).toEqual({ binding: 0 });
	});
	it('copies input coordinates before validating them', () => {
		let reads = 0;
		const inputs = [0];
		Object.defineProperty(inputs, 0, {
			get() {
				return ++reads === 1 ? 0 : Infinity;
			},
			enumerable: true
		});
		const activation = createTimeActivation(
			'auto',
			{ ...quantized, anchorMilliseconds: { binding: 0 } },
			inputs
		);
		try {
			expect(reads).toBe(1);
			expect(activation.inputs).toEqual([0]);
		} finally {
			activation.dispose();
		}
	});
	it('allows instant and observation aliases without changing private scheduling inputs', () => {
		const instant = timeInstant(0);
		const alias: { epochMilliseconds: number } = instant;
		alias.epochMilliseconds = 1;
		expect(instant.epochMilliseconds).toBe(1);
		const activation = createTimeActivation('auto', quantized, [0]);
		try {
			const plan = activation.plan as { quantumMilliseconds: number };
			plan.quantumMilliseconds = 1;
			expect(activation.plan).toEqual(quantized);
			const inputs = activation.inputs as number[];
			inputs[0] = Infinity;
			expect(activation.inputs).toEqual([0]);
			const clock = createManualTimeClock();
			const inspection = inspectTimeClock(clock);
			const view: { activeRegistrations: number } = inspection;
			view.activeRegistrations = 999;
			expect(inspectTimeClock(clock).activeRegistrations).toBe(0);
		} finally {
			activation.dispose();
		}
	});
	it('keeps one wall timestamp per synchronous cycle in independent ordinary observations', async () => {
		const first = wallTimeClock.now();
		const second = wallTimeClock.now();
		const original = second.epochMilliseconds;
		const alias: { epochMilliseconds: number } = first;
		alias.epochMilliseconds = 0;
		expect(second.epochMilliseconds).toBe(original);
		expect(wallTimeClock.now().epochMilliseconds).toBe(original);
		await Promise.resolve();
	});
	it.each([1e308, -1e308, Number.MAX_VALUE])(
		'bounds a deadline after extreme finite sample %s',
		(sample) => {
			const next = nextTimeChange({ protocol: 1, kind: 'continuous' }, 'second', sample);
			if (sample === Number.MAX_VALUE) expect(next).toBeUndefined();
			else {
				expect(Number.isFinite(next)).toBe(true);
				expect(next!).toBeGreaterThan(sample);
			}
		}
	);
	it('uses private teardown even when a writable public method alias is replaced', async () => {
		const clock = createManualTimeClock();
		const activation = createTimeActivation('second', { protocol: 1, kind: 'continuous' }, clock);
		activation.mount(clock);
		await Promise.resolve();
		activation.suspend = () => {};
		activation.dispose();
		await Promise.resolve();
		expect(clock.pendingTimerCount).toBe(0);
	});
	it('captures environment axes and rejects invalid first values', () => {
		let reads = 0;
		const clock = createManualTimeClock();
		const activation = createTimeActivation('second', { protocol: 1, kind: 'continuous' }, clock);
		try {
			activation.configureEnvironment({
				clock,
				get weekStartsOn() {
					return ++reads === 1 ? 1 : 99;
				}
			});
			expect(reads).toBe(1);
			expect(() => activation.configureEnvironment({ clock, weekStartsOn: 99 })).toThrow(
				/week start/
			);
		} finally {
			activation.dispose();
		}
	});
	it('advances zero and subnormal timestamps without reversing direction', () => {
		expect(nextFiniteInstant(0)).toBe(Number.MIN_VALUE);
		expect(nextFiniteInstant(-0)).toBe(Number.MIN_VALUE);
		expect(nextFiniteInstant(-Number.MIN_VALUE)).toBe(-0);
		expect(nextFiniteInstant(Number.MIN_VALUE)).toBe(Number.MIN_VALUE * 2);
		expect(() => nextFiniteInstant(Infinity)).toThrow(/finite/);
	});
	it('retains invalid boundary and binding rejection', () => {
		expect(() => validateTimeChangePlan({ ...quantized, boundary: 'unsupported' })).toThrow(
			/boundary/
		);
		expect(() =>
			validateTimeChangePlan({ ...quantized, anchorMilliseconds: { binding: 256 } })
		).toThrow(/bounded binding/);
	});
});
