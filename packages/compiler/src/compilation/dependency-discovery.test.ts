import { describe, expect, it } from 'vitest';
import { transitiveDependencies } from './dependency-discovery.js';

describe('compilation dependency planning', () => {
	it('returns the transitive closure once in deterministic traversal order', () => {
		const graph = new Map([
			['entry', ['shared', 'feature']],
			['feature', ['shared', 'leaf']],
			['shared', ['leaf']],
			['leaf', []]
		]);

		expect(transitiveDependencies('entry', graph)).toEqual(['shared', 'feature', 'leaf']);
	});

	it('does not include disconnected modules', () => {
		expect(
			transitiveDependencies(
				'entry',
				new Map([
					['entry', ['dependency']],
					['dependency', []],
					['unrelated', []]
				])
			)
		).toEqual(['dependency']);
	});
});
