import assert from 'node:assert/strict';
import test from 'node:test';

import {
	isNativeCompilerCorpusProject,
	isNativeCompilerCorpusSource,
	normalizedNativeBaselineElapsedMs,
	positiveInteger
} from './measurement.mjs';

test('selects explicit native fixtures and eXact JSX projects', () => {
	assert.equal(isNativeCompilerCorpusProject({ name: '@exactjs/native-compiler-corpus' }), true);
	assert.equal(isNativeCompilerCorpusProject({}, '@exactjs/jsx'), true);
	assert.equal(isNativeCompilerCorpusProject({ name: '@exactjs/unrelated' }), false);
});

test('selects production TypeScript sources only', () => {
	assert.equal(isNativeCompilerCorpusSource('component.tsx'), true);
	assert.equal(isNativeCompilerCorpusSource('component.test.tsx'), false);
	assert.equal(isNativeCompilerCorpusSource('contracts.d.ts'), false);
});

test('validates worker overrides', () => {
	assert.equal(positiveInteger(undefined, 4, 'workers'), 4);
	assert.equal(positiveInteger('2', 4, 'workers'), 2);
	assert.throws(() => positiveInteger('0', 4, 'workers'), /must be a positive integer/);
});

test('normalizes native baselines across corpus sizes and worker counts', () => {
	const baseline = { elapsedMs: 100, fileCount: 10, workers: 4 };
	assert.equal(normalizedNativeBaselineElapsedMs(baseline, { fileCount: 12, workers: 4 }), 120);
	assert.equal(normalizedNativeBaselineElapsedMs(baseline, { fileCount: 12, workers: 2 }), 240);
	assert.equal(normalizedNativeBaselineElapsedMs({}, { fileCount: 12, workers: 2 }), undefined);
});
