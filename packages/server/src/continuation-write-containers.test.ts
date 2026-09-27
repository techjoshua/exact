import { expect, it } from 'vitest';
import { prepareContinuationWriteContainers } from './continuation-write-containers.js';

const writes = (...paths: string[]) =>
	paths.map((path) => ({ path, kind: 'write' as const, confidence: 'exact' as const }));

it('prepares only missing ancestors and retains snapshot containers and values', () => {
	const present = { sibling: 3 };
	const state = { present, nullable: null, primitive: 5 } as Record<string, unknown>;
	prepareContinuationWriteContainers(
		state,
		writes('profile.deep.value', 'present.value', 'nullable.value', 'primitive.value', 'flat')
	);
	expect(state).toEqual({
		profile: { deep: {} },
		present: { sibling: 3 },
		nullable: null,
		primitive: 5
	});
	expect(state.present).toBe(present);
});

it.each([
	'__proto__.value',
	'profile.constructor.value',
	'profile.prototype.value',
	'profile..value'
])('rejects unsafe write containers for %s', (path) => {
	const state = {};
	expect(() => prepareContinuationWriteContainers(state, writes(path))).toThrow(
		'Unsafe continuation write path'
	);
	expect(state).toEqual({});
});

it('does not materialize wildcard, read or uncertain paths', () => {
	const state = {};
	prepareContinuationWriteContainers(state, [
		...writes('*'),
		{ path: 'a.b', kind: 'read', confidence: 'exact' },
		{ path: 'c.d', kind: 'write', confidence: 'unknown' }
	]);
	expect(state).toEqual({});
});
