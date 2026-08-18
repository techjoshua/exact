import { describe, expect, it } from 'vitest';
import { nextTimeChange, validateTimeChangePlan } from './plan.js';

describe('time change plans', () => {
	it('preserves non-wall-aligned countdown boundaries', () => {
		const plan = validateTimeChangePlan({
			protocol: 1,
			kind: 'quantized',
			quantumMilliseconds: 1_000,
			anchorMilliseconds: 10_250,
			boundary: 'ceil-decreasing'
		});
		expect(nextTimeChange(plan, 'auto', 9_100)).toBe(9_250);
		expect(nextTimeChange(plan, 'auto', 9_250)).toBe(10_250);
	});

	it('rejects executable or unbounded plan shapes', () => {
		expect(() =>
			validateTimeChangePlan({ protocol: 1, kind: 'quantized', quantumMilliseconds: 0 })
		).toThrow(/positive finite quantum/);
		expect(() => validateTimeChangePlan({ protocol: 1, kind: 'callback', run() {} })).toThrow(
			/Unsupported time change plan kind/
		);
		expect(() => validateTimeChangePlan({ protocol: 1, kind: 'continuous', run() {} })).toThrow(
			/unsupported data/
		);
	});

	it('bounds recursive compiler plan data', () => {
		let plan: unknown = { protocol: 1, kind: 'complete' };
		for (let index = 0; index < 34; index++) {
			plan = {
				protocol: 1,
				kind: 'threshold',
				thresholdMilliseconds: index,
				before: { protocol: 1, kind: 'complete' },
				after: plan
			};
		}
		expect(() => validateTimeChangePlan(plan)).toThrow(/maximum depth|maximum node count/);
	});

	it('uses separately provided calendar axes for explicit policies', () => {
		const sample = Date.parse('2026-03-08T08:00:00.000Z');
		expect(
			nextTimeChange({ protocol: 1, kind: 'continuous' }, 'day', sample, {
				timeZone: 'America/Los_Angeles',
				calendar: 'gregory',
				weekStartsOn: 1
			})
		).toBe(Date.parse('2026-03-09T07:00:00.000Z'));
	});

	it('matches brute-force integer clock boundaries across negative and positive offsets', () => {
		for (const boundary of [
			'ceil-decreasing',
			'floor-increasing',
			'round-decreasing',
			'round-increasing',
			'half-expand-decreasing',
			'half-expand-increasing',
			'trunc-decreasing',
			'trunc-increasing'
		] as const) {
			for (let anchor = -1_250; anchor <= 1_250; anchor += 137) {
				for (let sample = -2_000; sample <= 2_000; sample += 113) {
					const quantum = 250;
					const value = (instant: number) => {
						switch (boundary) {
							case 'ceil-decreasing':
								return Math.ceil((anchor - instant) / quantum);
							case 'floor-increasing':
								return Math.floor((instant - anchor) / quantum);
							case 'round-decreasing':
								return Math.round((anchor - instant) / quantum);
							case 'round-increasing':
								return Math.round((instant - anchor) / quantum);
							case 'half-expand-decreasing': {
								const value = (anchor - instant) / quantum;
								return value < 0 ? Math.ceil(value - 0.5) : Math.floor(value + 0.5);
							}
							case 'half-expand-increasing': {
								const value = (instant - anchor) / quantum;
								return value < 0 ? Math.ceil(value - 0.5) : Math.floor(value + 0.5);
							}
							case 'trunc-decreasing':
								return Math.trunc((anchor - instant) / quantum);
							case 'trunc-increasing':
								return Math.trunc((instant - anchor) / quantum);
						}
					};
					let expected = sample + 1;
					while (value(expected) === value(sample)) expected++;
					const actual = nextTimeChange(
						{
							protocol: 1,
							kind: 'quantized',
							quantumMilliseconds: quantum,
							anchorMilliseconds: anchor,
							boundary
						},
						'auto',
						sample
					);
					expect(actual).toBe(expected);
				}
			}
		}
	});

	it('uses zoned calendar boundaries across daylight-saving transitions', () => {
		const sample = Date.parse('2026-03-08T08:00:00.000Z');
		const deadline = nextTimeChange(
			{
				protocol: 1,
				kind: 'calendar',
				unit: 'day',
				timeZone: 'America/Los_Angeles'
			},
			'auto',
			sample
		);
		expect(deadline).toBe(Date.parse('2026-03-09T07:00:00.000Z'));
		expect(deadline! - sample).toBe(23 * 60 * 60 * 1_000);
		const fallSample = Date.parse('2026-11-01T07:00:00.000Z');
		const fallDeadline = nextTimeChange(
			{
				protocol: 1,
				kind: 'calendar',
				unit: 'day',
				timeZone: 'America/Los_Angeles'
			},
			'auto',
			fallSample
		);
		expect(fallDeadline).toBe(Date.parse('2026-11-02T08:00:00.000Z'));
		expect(fallDeadline! - fallSample).toBe(25 * 60 * 60 * 1_000);
	});

	it('finds exact Gregorian month and year boundaries across varying lengths', () => {
		for (const [sample, expected] of [
			['2023-02-01T00:00:00Z', '2023-03-01T00:00:00Z'],
			['2024-02-01T00:00:00Z', '2024-03-01T00:00:00Z'],
			['2026-04-01T00:00:00Z', '2026-05-01T00:00:00Z'],
			['2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z']
		] as const)
			expect(
				nextTimeChange(
					{
						protocol: 1,
						kind: 'calendar',
						unit: 'month',
						timeZone: 'UTC',
						calendar: 'gregory'
					},
					'auto',
					Date.parse(sample)
				)
			).toBe(Date.parse(expected));
		expect(
			nextTimeChange(
				{
					protocol: 1,
					kind: 'calendar',
					unit: 'year',
					timeZone: 'UTC',
					calendar: 'gregory'
				},
				'auto',
				Date.parse('2024-01-01T00:00:00Z')
			)
		).toBe(Date.parse('2025-01-01T00:00:00Z'));
	});

	it('adapts nested relative-time branches at their exact thresholds', () => {
		const plan = validateTimeChangePlan({
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
		});
		expect(nextTimeChange(plan, 'auto', 58_500)).toBe(59_000);
		expect(nextTimeChange(plan, 'auto', 59_000)).toBe(60_000);
		expect(nextTimeChange(plan, 'auto', 60_000)).toBe(120_000);
	});

	it('refreshes finite plan coordinates through bounded numeric bindings', () => {
		const plan = validateTimeChangePlan({
			protocol: 1,
			kind: 'quantized',
			quantumMilliseconds: 1_000,
			anchorMilliseconds: { binding: 0 },
			boundary: 'ceil-decreasing'
		});
		expect(nextTimeChange(plan, 'auto', 9_100, undefined, [10_250])).toBe(9_250);
		expect(() => nextTimeChange(plan, 'auto', 9_100)).toThrow(/binding 0/);
	});

	it('rejects unresolved automatic sensitivity instead of silently polling', () => {
		expect(() => nextTimeChange({ protocol: 1, kind: 'continuous' }, 'auto', 0)).toThrow(
			/compiler-provable/
		);
		expect(nextTimeChange({ protocol: 1, kind: 'continuous' }, 'second', 0)).toBe(1_000);
	});

	it('finds leap-month and non-Gregorian calendar changes without fixed month lengths', () => {
		expect(
			nextTimeChange(
				{
					protocol: 1,
					kind: 'calendar',
					unit: 'month',
					timeZone: 'UTC'
				},
				'auto',
				Date.parse('2024-02-01T00:00:00.000Z')
			)
		).toBe(Date.parse('2024-03-01T00:00:00.000Z'));
		const islamic = {
			protocol: 1,
			kind: 'calendar',
			unit: 'month',
			timeZone: 'UTC',
			calendar: 'islamic'
		} as const;
		const islamicDeadline = nextTimeChange(islamic, 'auto', Date.parse('2026-01-01T00:00:00Z'))!;
		const formatter = new Intl.DateTimeFormat('en-u-ca-islamic', {
			timeZone: 'UTC',
			year: 'numeric',
			month: 'numeric'
		});
		expect(formatter.format(islamicDeadline - 1)).not.toBe(formatter.format(islamicDeadline));
	});
});
