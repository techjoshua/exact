import { describe, expect, it } from 'vitest';
import { validateJsonSafeHydrationValue } from './hydration-json.js';

describe('hydration JSON validation', () => {
	it('trusts framework tuple structure without trusting nested authored values', () => {
		let accessorInvoked = false;
		const authored: Record<string, unknown> = {};
		Object.defineProperty(authored, 'secret', {
			enumerable: true,
			get() {
				accessorInvoked = true;
				return 'unsafe';
			}
		});
		const entry: [number, unknown] = [0, authored];
		const entries = [entry];
		const resumption: [string, [number, unknown][]] = ['component', entries];
		const resumptions = [resumption];
		const payload = { resumptions };
		const structurallyKnown = new WeakSet<object>([
			payload,
			resumptions,
			resumption,
			entries,
			entry
		]);

		expect(validateJsonSafeHydrationValue(payload, { structurallyKnown })).toBe(
			'$.resumptions[0][1][0][1].secret'
		);
		expect(accessorInvoked).toBe(false);
	});

	it('preserves object, array, cycle, and limit failure paths', () => {
		expect(validateJsonSafeHydrationValue({ rows: [{ value: Number.NaN }] }, {})).toBe(
			'$.rows[0].value'
		);
		const cycle: Record<string, unknown> = {};
		cycle.self = cycle;
		expect(validateJsonSafeHydrationValue({ cycle }, {})).toBe('$.cycle.self');
		expect(validateJsonSafeHydrationValue({ first: { second: true } }, { maxDepth: 1 })).toBe(
			'$.first.second'
		);
		expect(validateJsonSafeHydrationValue({ first: true }, { maxNodes: 1 })).toBe('$.first');
	});

	it('observes arrays only after their complete contents pass validation', () => {
		const observed: unknown[][] = [];
		const safe = [[{ value: true }]];
		expect(
			validateJsonSafeHydrationValue(safe, {
				onValidatedArray: (value) => observed.push(value)
			})
		).toBeUndefined();
		expect(observed).toEqual([safe[0], safe]);

		const rejected: unknown[] = [];
		Object.defineProperty(rejected, '0', { enumerable: true, get: () => 'unsafe' });
		expect(
			validateJsonSafeHydrationValue(rejected, {
				onValidatedArray: (value) => observed.push(value)
			})
		).toBe('$[0]');
		expect(observed).toEqual([safe[0], safe]);
	});

	it('traverses framework-created dense tuples without trusting authored entries', () => {
		const authored = Object.create(null) as Record<string, unknown>;
		authored.value = 'unsafe prototype';
		const entry = [0, authored] as const;
		const entries = [entry];
		const structurallyKnown = new WeakSet<object>([entries, entry as object]);

		expect(validateJsonSafeHydrationValue(entries, { structurallyKnown })).toBe('$[0][1]');
	});
});
