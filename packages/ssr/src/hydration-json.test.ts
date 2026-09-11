import { describe, expect, it } from 'vitest';
import { validateJsonSafeHydrationValue } from './hydration-json.js';
import { registerPositionalProjector } from './runtime/positional-projection.js';

describe('hydration JSON validation', () => {
	it('preserves positional primitive values, rejection paths, and exact graph budgets', () => {
		const validate = (value: unknown, maxNodes = 5, maxDepth = 3) => {
			const payload = { state: null };
			const failure = validateJsonSafeHydrationValue(payload, {
				structurallyKnownRoot: payload,
				positionalRoot: {
					componentId: 'test:primitive',
					props: { value },
					schema: [1, 'value', 0]
				},
				maxNodes,
				maxDepth
			});
			return { payload, failure };
		};
		for (const value of [null, '', '<&\u2028', true, false, 0, -0, 1.5]) {
			const result = validate(value);
			expect(result.failure).toBeUndefined();
			expect(result.payload.state).toEqual(['test:primitive', [value]]);
			expect(validate(value, 4).failure).toBeDefined();
			expect(validate(value, 5, 2).failure).toBe('$.state.value');
		}
		for (const value of [undefined, NaN, Infinity, -Infinity, 1n, Symbol('unsafe'), () => 1])
			expect(validate(value).failure).toBe('$.state.value');
	});

	it('keeps deep cycles distinct from shared siblings across ancestor promotion', () => {
		const root: Record<string, unknown> = {};
		let cursor = root;
		for (let depth = 0; depth < 24; depth++) {
			const next: Record<string, unknown> = {};
			cursor.next = next;
			cursor = next;
		}
		const shared = { value: 'safe' };
		cursor.rows = [shared, shared];
		expect(validateJsonSafeHydrationValue(root, {})).toBeUndefined();
		cursor.cycle = root;
		expect(validateJsonSafeHydrationValue(root, {})).toBe(`$${'.next'.repeat(24)}.cycle`);
		delete cursor.cycle;
		expect(validateJsonSafeHydrationValue(root, {})).toBeUndefined();
	});

	it('retains shallow ancestry through version-one projectors without a native Set', () => {
		const shared = { value: 'shared' };
		const props = { rows: Array.from({ length: 16 }, () => shared) };
		let calls = 0;
		const item = registerPositionalProjector([1, 'value', 0] as const, 1, (value, depth, state) => {
			calls++;
			expect(state.active).not.toBeInstanceOf(Set);
			expect(state.active.has(props)).toBe(true);
			expect(state.active.has(props.rows)).toBe(true);
			expect(state.active.has(value)).toBe(false);
			state.active.add(value);
			try {
				return state.validate(value.value, depth + 1, state) ? [value.value] : state.unsafe;
			} finally {
				state.active.delete(value);
			}
		});
		const payload = { state: null };
		expect(
			validateJsonSafeHydrationValue(payload, {
				structurallyKnownRoot: payload,
				positionalRoot: {
					componentId: 'test:shallow-ancestors',
					props,
					schema: [1, 'rows', [2, item]]
				}
			})
		).toBeUndefined();
		expect(calls).toBe(16);
	});

	it('rechecks positional field ownership after earlier authored getters run', () => {
		const props: Record<string, unknown> = {};
		Object.defineProperty(props, 'first', {
			enumerable: true,
			get() {
				delete props.second;
				Object.setPrototypeOf(props, { second: 'inherited' });
				return 'first';
			}
		});
		props.second = 'owned';
		const payload = { state: null };
		expect(
			validateJsonSafeHydrationValue(payload, {
				structurallyKnownRoot: payload,
				positionalRoot: {
					componentId: 'test:ownership',
					props,
					schema: [1, 'first', 0, 'second', 0]
				}
			})
		).toBeDefined();
	});

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

		expect(
			validateJsonSafeHydrationValue(payload, {
				directResumptions: resumptions,
				structurallyKnownRoot: payload
			})
		).toBe('$.resumptions[0][1][0][1].secret');
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

		const safeBeforeFailure: unknown[] = [];
		const lateFailure = [safeBeforeFailure, { value: Number.NaN }];
		expect(
			validateJsonSafeHydrationValue(lateFailure, {
				onValidatedArray: (value) => observed.push(value)
			})
		).toBe('$[1].value');
		expect(observed).toEqual([safe[0], safe, safeBeforeFailure]);
	});

	it('traverses framework-created dense tuples without trusting authored entries', () => {
		const authored = Object.create(null) as Record<string, unknown>;
		authored.value = 'unsafe prototype';
		const entry = [0, authored] as const;
		const entries = [entry];
		const structurallyKnown = new WeakSet<object>([entries, entry as object]);

		expect(validateJsonSafeHydrationValue(entries, { structurallyKnown })).toBe('$[0][1]');
	});

	it('observes authored arrays but not compiler-owned resumption tuples', () => {
		const authored: unknown[] = ['value'];
		const resumptions = [['component', [[0, authored]]]] as const;
		const payload = { resumptions };
		const observed: unknown[][] = [];

		expect(
			validateJsonSafeHydrationValue(payload, {
				directResumptions: resumptions,
				structurallyKnownRoot: payload,
				onValidatedArray: (value) => observed.push(value)
			})
		).toBeUndefined();
		expect(observed).toEqual([authored]);
	});

	it('applies graph limits across compiler-owned resumption tuples', () => {
		const resumptions = [['component', [[0, 'value']]]] as const;
		const payload = { resumptions };

		expect(
			validateJsonSafeHydrationValue(payload, {
				directResumptions: resumptions,
				structurallyKnownRoot: payload,
				maxNodes: 5
			})
		).toBe('$.resumptions[0][1][0]');
	});

	it('rejects authored values that point back into compiler-owned tuples', () => {
		const entry: [number, unknown] = [0, undefined];
		const resumption: [string, [number, unknown][]] = ['component', [entry]];
		const resumptions = [resumption];
		entry[1] = resumptions;
		const payload = { resumptions };

		expect(
			validateJsonSafeHydrationValue(payload, {
				directResumptions: resumptions,
				structurallyKnownRoot: payload
			})
		).toBe('$.resumptions[0][1][0][1]');
	});
});
