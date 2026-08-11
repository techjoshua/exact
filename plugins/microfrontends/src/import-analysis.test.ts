import { describe, expect, it } from 'vitest';
import { analyzeProvidedPackageImports } from './import-analysis.js';

describe('provided package import analysis', () => {
	it('plans named facade re-exports through the provided package bridge', () => {
		const result = analyzeProvidedPackageImports(
			`export { reactive as live, computed } from '@exactjs/reactive';`,
			'capability.js',
			['@exactjs/reactive']
		);
		expect(result.get('@exactjs/reactive')).toEqual([
			{ kind: 'named', imported: 'reactive' },
			{ kind: 'named', imported: 'computed' }
		]);
	});

	it('retains the unsupported marker for unbounded star re-exports', () => {
		const result = analyzeProvidedPackageImports(
			`export * from '@exactjs/reactive';`,
			'capability.js',
			['@exactjs/reactive']
		);
		expect(result.get('@exactjs/reactive')).toEqual([{ kind: 're-export' }]);
	});
});
