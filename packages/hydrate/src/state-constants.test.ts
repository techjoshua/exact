import { expect, it } from 'vitest';
import { commitStateForContract, mergeStateForContract, stateForContract } from './state.js';

const writes = [{ path: 'nested.value', kind: 'write', confidence: 'exact' }] as const;

it('projects undefined value reads while retaining missing-container rejection', () => {
	const reads = [{ path: 'nested.value', kind: 'read', confidence: 'exact' }] as const;
	expect(stateForContract({ nested: { value: undefined } }, { reads })).toEqual({
		nested: { value: undefined }
	});
	expect(stateForContract({ nested: {} }, { reads })).toEqual({ nested: { value: undefined } });
	expect(stateForContract({}, { reads })).toBeUndefined();
});

it('clears an authorized value to undefined without deleting it or touching siblings', () => {
	const state = { nested: { value: 'before' as unknown, sibling: 'keep' }, other: 'keep' };
	const update = { nested: { value: undefined } };
	expect(mergeStateForContract(state, update, { writes })).toEqual({
		ok: true,
		state: { nested: { value: undefined, sibling: 'keep' }, other: 'keep' }
	});
	expect(state.nested.value).toBe('before');
	commitStateForContract(state, update, { writes });
	expect(Object.hasOwn(state.nested, 'value')).toBe(true);
	expect(state.nested.value).toBeUndefined();
	expect(state.nested.sibling).toBe('keep');
});

it('does not interpret an omitted conditional write as a deletion or assignment', () => {
	const state = { nested: { value: 'before' } };
	expect(mergeStateForContract(state, {}, { writes })).toEqual({ ok: true, state });
	commitStateForContract(state, {}, { writes });
	expect(state.nested.value).toBe('before');
});

it.each(['parent-first', 'leaf-first'] as const)(
	'keeps complete enclosing snapshots unchanged with %s input order',
	(order) => {
		const parent = { path: 'nested', kind: 'read', confidence: 'exact' } as const;
		const leaf = { path: 'nested.value', kind: 'read', confidence: 'exact' } as const;
		const input = { nested: {} };
		const snapshot = stateForContract(input, {
			reads: order === 'parent-first' ? [parent, leaf] : [leaf, parent]
		});
		expect(snapshot).toEqual(input);
		expect(Object.hasOwn((snapshot as typeof input).nested, 'value')).toBe(false);
	}
);
