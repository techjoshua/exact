import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeCompilerTestSelection } from './native-compiler-test-selection.mjs';

test('ordinary native validation retains the complete suite', () => {
	assert.deepEqual(nativeCompilerTestSelection({}), { focused: false, args: [] });
});

test('any explicit test filter remains partial validation, including an all-matching filter', () => {
	for (const testPattern of ['^TestRegression$', '.*']) {
		assert.deepEqual(nativeCompilerTestSelection({ testPattern }), {
			focused: true,
			args: ['-count=1', '-run', testPattern]
		});
	}
});

test('partial validation cannot select coverage or package output', () => {
	for (const options of [{ testPattern: '' }, ...['packageOutput', 'collectCoverage', 'allTargets'].map((name) => ({ testPattern: '^TestRegression$', [name]: true }))]) {
		assert.throws(() => nativeCompilerTestSelection(options), /cannot select packaging or coverage/);
	}
});
