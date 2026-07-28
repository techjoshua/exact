import { describe, expect, it } from 'vitest';
import {
	commitCollectionMutationsForContract,
	mergeCollectionMutationsForContract
} from './state.js';

const writes = [
	{ path: 'lookup', kind: 'write', confidence: 'exact', operation: 'map' },
	{ path: 'selected', kind: 'write', confidence: 'exact', operation: 'set' }
] as const;

describe('@exactjs/hydrate collection state', () => {
	it('validates and applies ordered collection deltas without mutating the prior snapshot', () => {
		const state = {
			lookup: new Map<string, number>([['old', 1]]),
			selected: new Set(['old']),
			untouched: { stable: true }
		};
		const merged = mergeCollectionMutationsForContract(
			state,
			[
				{ path: 'lookup', operation: 'map-set', key: 'answer', value: 42 },
				{ path: 'lookup', operation: 'map-delete', key: 'old' },
				{ path: 'selected', operation: 'set-clear' },
				{ path: 'selected', operation: 'set-add', value: 'answer' }
			],
			{ writes }
		);

		expect(merged.ok).toBe(true);
		if (!merged.ok) return;
		expect(state.lookup).toEqual(new Map([['old', 1]]));
		expect((merged.state as typeof state).lookup).toEqual(new Map([['answer', 42]]));
		expect((merged.state as typeof state).selected).toEqual(new Set(['answer']));
		expect((merged.state as typeof state).untouched).toBe(state.untouched);
	});

	it('rejects collection deltas outside the compiler contract', () => {
		expect(
			mergeCollectionMutationsForContract(
				{ lookup: new Map(), other: new Set() },
				[{ path: 'other', operation: 'set-add', value: 'unsafe' }],
				{ writes }
			)
		).toEqual({ ok: false });
	});

	it('commits through native collection methods for live reactive state', () => {
		const state = { lookup: new Map<string, number>(), selected: new Set<string>() };
		expect(
			commitCollectionMutationsForContract(
				state,
				[
					{ path: 'lookup', operation: 'map-set', key: 'answer', value: 42 },
					{ path: 'selected', operation: 'set-add', value: 'answer' }
				],
				{ writes }
			)
		).toBe(true);
		expect(state.lookup.get('answer')).toBe(42);
		expect(state.selected.has('answer')).toBe(true);
	});
});
