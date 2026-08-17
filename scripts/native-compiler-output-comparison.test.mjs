import assert from 'node:assert/strict';
import test from 'node:test';

import {
	firstNativeCompilerDifference,
	normalizeNativeCompilerResponse
} from './compare-native-compiler-output.mjs';

test('normalizes only execution-specific native response fields', () => {
	assert.deepEqual(
		normalizeNativeCompilerResponse({
			id: 'fixture',
			code: 'output',
			timings: { totalMicroseconds: 1 },
			cacheHit: true,
			analysis: { components: [] }
		}),
		{
			id: 'fixture',
			code: 'output',
			analysis: { components: [] }
		}
	);
});

test('reports the first ordered response difference', () => {
	assert.deepEqual(
		firstNativeCompilerDifference(
			{ code: 'same', diagnostics: [{ code: 'before' }] },
			{ code: 'same', diagnostics: [{ code: 'after' }] }
		),
		{
			location: '$.diagnostics[0].code',
			before: 'before',
			after: 'after'
		}
	);
});
