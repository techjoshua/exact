import { expect, it, vi } from 'vitest';
import { reactive, unwrap, watch, flushSync } from '@exactjs/reactive';
import {
	mergeStateForContract,
	commitStateForContract,
	mergeStatePublicationForContract
} from './state.js';
import { isStateDeletionList } from '@exactjs/core/framework/protocol-records';

const writes = [
	{ path: 'nested.value', kind: 'write', confidence: 'exact' },
	{ path: 'rows.1', kind: 'write', confidence: 'exact' }
] as const;

it('removes authorized properties and array cells without changing the prior snapshot or unrelated values', () => {
	const original = {
		nested: { value: undefined, sibling: 'keep' },
		rows: ['a', 'b', 'c'],
		sibling: 'keep'
	};
	const result = mergeStateForContract(original, undefined, { writes }, ['nested.value', 'rows.1']);
	expect(result.ok).toBe(true);
	if (!result.ok) return;
	const state = result.state as typeof original;
	expect(Object.hasOwn(state.nested, 'value')).toBe(false);
	expect(Object.hasOwn(state.rows, 1)).toBe(false);
	expect(state.rows.length).toBe(3);
	expect(state.nested.sibling).toBe('keep');
	expect(state.sibling).toBe('keep');
	expect(Object.hasOwn(original.nested, 'value')).toBe(true);
	expect(original.rows[1]).toBe('b');
	const live = reactive(original);
	const nested = live.nested;
	const rows = live.rows;
	commitStateForContract(live, undefined, { writes }, ['nested.value', 'rows.1']);
	expect(live.nested).toBe(nested);
	expect(live.rows).toBe(rows);
	expect(Object.hasOwn(live.nested, 'value')).toBe(false);
	expect(Object.hasOwn(live.rows, 1)).toBe(false);
});

it.each(['forbidden', 'nested.sibling', '__proto__.polluted', 'nested..value', '*'])(
	'rejects unauthorized or unsafe deletion %s without publishing valid sibling writes',
	(path) => {
		const target = { nested: { value: 'before' }, other: 'keep' };
		expect(
			mergeStateForContract(target, { nested: { value: 'after' } }, { writes }, [path])
		).toEqual({ ok: false });
		commitStateForContract(target, { nested: { value: 'after' } }, { writes }, [path]);
		expect(target.nested.value).toBe('before');
	}
);

it('rejects holes and slot accessors without executing them', () => {
	expect(isStateDeletionList(new Array(1))).toBe(false);
	const get = vi.fn(() => 'nested.value');
	const paths = Object.defineProperty([], '0', { get });
	expect(isStateDeletionList(paths)).toBe(false);
	expect(mergeStateForContract({}, {}, { writes }, paths)).toEqual({ ok: false });
	expect(get).not.toHaveBeenCalled();
});

it('uses wildcard authority for a deletion-only response without replacing unrelated state', () => {
	const target = { remove: 1, keep: 2 };
	const wildcard = { writes: [{ path: '*', kind: 'write', confidence: 'exact' }] as const };
	expect(mergeStateForContract(target, undefined, wildcard, ['remove'])).toEqual({
		ok: true,
		state: { keep: 2 }
	});
	commitStateForContract(target, undefined, wildcard, ['remove']);
	expect(target).toEqual({ keep: 2 });
});

it('keeps descendant selections separate from parent replacement authority in snapshots and live receivers', () => {
	const permissions = {
		writes: [
			{ path: 'nested', kind: 'write', confidence: 'exact' },
			{ path: 'nested.value', kind: 'write', confidence: 'exact' }
		] as const
	};
	const original = { nested: { value: 'before', sibling: 'keep' } };
	const result = { state: { nested: { value: 'after' } }, statePaths: ['nested.value'] };
	expect(mergeStatePublicationForContract(original, result, permissions)).toEqual({
		ok: true,
		state: { nested: { value: 'after', sibling: 'keep' } }
	});
	const live = reactive(original);
	const receiver = live.nested;
	commitStateForContract(live, result.state, permissions, [], result.statePaths);
	expect(live.nested).toBe(receiver);
	expect(live.nested.sibling).toBe('keep');
	expect(live.nested.value).toBe('after');
	const parent = { state: { nested: { value: 'replaced' } }, statePaths: ['nested'] };
	expect(mergeStatePublicationForContract(original, parent, permissions)).toEqual({
		ok: true,
		state: parent.state
	});
});

it('rejects an unauthorized selection before applying valid deletions or collection deltas', () => {
	const original = { nested: { value: 'before' }, lookup: new Map([['keep', 1]]) };
	const permissions = {
		writes: [
			...writes,
			{ path: 'lookup', kind: 'write', confidence: 'exact', operation: 'map' }
		] as const
	};
	expect(
		mergeStatePublicationForContract(
			original,
			{
				state: { forbidden: 'after' },
				statePaths: ['forbidden'],
				deletions: ['nested.value'],
				mutations: [{ path: 'lookup', operation: 'map-clear' }]
			},
			permissions
		)
	).toEqual({ ok: false });
	expect(original.nested.value).toBe('before');
	expect(original.lookup.get('keep')).toBe(1);
});

it('consumes owned selections without invoking iterator hooks and rejects accessor slots', () => {
	const selected = ['nested.value'];
	const iterate = vi.fn(() => {
		throw new Error('iterator');
	});
	Object.defineProperty(selected, Symbol.iterator, { value: iterate });
	const update = { nested: { value: 'after' } };
	expect(
		mergeStateForContract({ nested: { value: 'before' } }, update, { writes }, [], selected)
	).toEqual({ ok: true, state: update });
	expect(iterate).not.toHaveBeenCalled();
	const get = vi.fn(() => 'nested.value');
	const accessor = Object.defineProperty([], '0', { get });
	expect(mergeStateForContract({}, update, { writes }, [], accessor)).toEqual({ ok: false });
	expect(get).not.toHaveBeenCalled();
});

it.each([1, 2])(
	'replaces only the selected object leaf under parent write authority (%s)',
	(value) => {
		const initial = { count: 1 };
		const live = reactive({ nested: { leaf: initial, sibling: 'keep' } });
		const ancestor = live.nested;
		const previous = live.nested.leaf;
		const leaf = { count: value };
		const seen: number[] = [];
		const stop = watch(() => seen.push(live.nested.leaf.count));
		try {
			commitStateForContract(
				live,
				{ nested: { leaf, sibling: 'unauthorized' } },
				{
					writes: [{ path: 'nested', kind: 'write', confidence: 'exact' }]
				},
				[],
				['nested.leaf']
			);
			flushSync();
			expect(live.nested).toBe(ancestor);
			expect(live.nested.sibling).toBe('keep');
			expect(unwrap(live.nested.leaf)).toBe(leaf);
			expect(previous.count).toBe(1);
			live.nested.leaf.count = 3;
			flushSync();
			previous.count = 4;
			flushSync();
			expect(seen).toEqual([1, value, 3]);
		} finally {
			stop();
		}
	}
);
