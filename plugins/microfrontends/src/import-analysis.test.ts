import { describe, expect, it } from 'vitest';
import {
	analyzeProvidedPackageImports,
	createProvidedPackageImportAnalysis
} from './import-analysis.js';

describe('provided package import analysis', () => {
	it('collects repeated imports, aliases, static namespace indexing and empty evaluation imports', () => {
		const result = analyzeProvidedPackageImports(
			`import {watch as observe} from '@exactjs/reactive';
import {flushSync} from '@exactjs/reactive';
import * as State from '@exactjs/reactive';
import {} from '@exactjs/reactive';
State['reactive']({}); observe(() => {}); flushSync();`,
			'remote.js',
			['@exactjs/reactive']
		);
		expect(result.get('@exactjs/reactive')).toEqual([
			{ kind: 'named', imported: 'watch' },
			{ kind: 'named', imported: 'flushSync' },
			{ kind: 'side-effect' },
			{ kind: 'namespace', exportNames: ['reactive'] }
		]);
	});

	it('distinguishes shadowed names and unrelated property names from the imported namespace', () => {
		const result = analyzeProvidedPackageImports(
			`import * as State from '@exactjs/reactive';
State['watch'](() => {});
function local(State) { return State; }
const object = { State: 1 }; object.State;
type Module = typeof State;`,
			'remote.ts',
			['@exactjs/reactive']
		);
		expect(result.get('@exactjs/reactive')).toEqual([
			{ kind: 'namespace', exportNames: ['watch'] }
		]);
	});

	it('preserves invalid import diagnostics instead of treating them as unprovided packages', () => {
		const analysis = createProvidedPackageImportAnalysis(['@exactjs/reactive']);
		expect(analysis.isProvidedRequest('@exactjs/reactive')).toBe(true);
		expect(analysis.isProvidedRequest('@ordinary/library')).toBe(false);
		for (const source of [
			`import * as State from '@exactjs/reactive'; consume(State);`,
			`import * as State from '@exactjs/reactive'; State[dynamic];`,
			`import('@exactjs/reactive');`,
			`import('@exactjs/reactive', {with: {type: 'json'}});`,
			'import(`@exactjs/reactive`);'
		])
			expect(() => analysis.analyzeProvidedImports(source, 'remote.js')).toThrow();
		expect(() => analysis.analyzeProvidedImports(undefined, 'remote.js')).toThrow('unavailable');
		expect(analysis.analyzeProvidedImports(`import('@ordinary/library');`, 'remote.js').size).toBe(
			0
		);
		expect(
			analysis
				.analyzeProvidedImports(`import {watch} from '@exactjs/reactive';`, 'remote.js')
				.get('@exactjs/reactive')
		).toEqual([{ kind: 'named', imported: 'watch' }]);
		expect(
			analysis
				.analyzeProvidedImports(`import {flushSync} from '@exactjs/reactive';`, 'remote.js')
				.get('@exactjs/reactive')
		).toEqual([{ kind: 'named', imported: 'flushSync' }]);
	});

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
