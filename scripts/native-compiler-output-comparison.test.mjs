import assert from 'node:assert/strict';
import test from 'node:test';

import {
	firstNativeCompilerDifference,
	normalizeNativeCompilerResponse
} from './native-compiler-output-comparison.mjs';

test('normalizes only execution-specific native response fields', () => {
	assert.deepEqual(
		normalizeNativeCompilerResponse({
			id: 'fixture',
			code: 'output',
			timings: { totalMicroseconds: 1 },
			counters: { programRebuilds: 1 },
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

test('can compare semantic output across protocol versions', () => {
	assert.deepEqual(
		normalizeNativeCompilerResponse(
			{
				protocolVersion: '2.0.0',
				backendVersion: '2.0.0',
				typescriptVersion: '7.1.0',
				code: 'output'
			},
			true
		),
		{ code: 'output' }
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
