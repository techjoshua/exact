import assert from 'node:assert/strict';
import test from 'node:test';

import { readComponentLocalTargetAbiPerformanceOutput } from './performance-output.mjs';

const names = [
	'REACTIVE_BENCHMARK_JSON',
	'DOM_LIST_BENCHMARK_JSON',
	'EXACT_FRAMEWORK_BENCHMARK_JSON',
	'COMPILER_BENCHMARK_JSON',
	'THEME_BENCHMARK_JSON',
	'DEVTOOLS_BENCHMARK_JSON',
	'REACT_COMPAT_BENCHMARK_JSON'
];

test('extracts every required benchmark result from captured phase output', () => {
	const output = names.map((name) => `${name}=${JSON.stringify({ name })}`).join('\n');
	const result = readComponentLocalTargetAbiPerformanceOutput({
		schemaVersion: 1,
		phases: [{ name: 'all', output }]
	});
	assert.deepEqual(Object.keys(result), names);
});

test('rejects partial and repeated internal performance evidence', () => {
	assert.throws(
		() =>
			readComponentLocalTargetAbiPerformanceOutput({
				schemaVersion: 1,
				phases: [{ output: `${names[0]}={}` }]
			}),
		/omitted required results/
	);
	const output = [...names, names[0]].map((name) => `${name}={}`).join('\n');
	assert.throws(
		() =>
			readComponentLocalTargetAbiPerformanceOutput({
				schemaVersion: 1,
				phases: [{ output }]
			}),
		/repeated REACTIVE/
	);
});
