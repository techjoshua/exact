import { expect, it } from 'vitest';
import { acceptComponentStateCommit } from './state-ordering.js';

function writes(...paths: string[]) {
	return paths.map((path) => ({ path, kind: 'write' as const, confidence: 'exact' as const }));
}

it.each([
	['profile', 'profile.name', false],
	['profile.name', 'profile', false],
	['*', 'profile.name', false],
	['profile.name', '*', false],
	['profile.name', 'profile.name', false],
	['profile.name', 'profile.age', true],
	['row', 'rows', true]
] as const)(
	'orders newer %s against older %s without conflating unrelated paths',
	(newer, older, accepted) => {
		const owner = {};
		expect(acceptComponentStateCommit(owner, writes(newer), 2)).toBe(true);
		expect(acceptComponentStateCommit(owner, writes(older), 1)).toBe(accepted);
		expect(acceptComponentStateCommit({}, writes(older), 1)).toBe(true);
		expect(acceptComponentStateCommit(owner, writes(older), 3)).toBe(true);
	}
);

it('rejects a conflicting response atomically without advancing its other paths', () => {
	const owner = {};
	expect(acceptComponentStateCommit(owner, writes('a'), 3)).toBe(true);
	expect(acceptComponentStateCommit(owner, writes('a', 'b'), 2)).toBe(false);
	expect(acceptComponentStateCommit(owner, writes('b'), 1)).toBe(true);
});
