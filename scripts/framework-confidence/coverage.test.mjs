import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { summarizeFrameworkCoverage } from './coverage.mjs';

const root = path.resolve('framework-coverage-fixture');
const filename = (name) => path.join(root, 'packages/reactive/src', name);
const counters = (total, covered) =>
	Object.fromEntries(
		['statements', 'branches', 'functions', 'lines'].map((metric) => [metric, { total, covered }])
	);

test('weights counters and retains unexecuted files in the investigation order', () => {
	const result = summarizeFrameworkCoverage(
		{
			total: counters(999, 999),
			[filename('small.ts')]: counters(1, 1),
			[filename('large.ts')]: counters(9, 0),
			[filename('types.ts')]: counters(0, 0)
		},
		root
	);
	assert.deepEqual(result.total.branches, { total: 10, covered: 1, missed: 9, percent: 10 });
	assert.equal(result.owners[0].branches.percent, 10);
	assert.equal(result.files[0].filename, 'packages/reactive/src/large.ts');
	assert.equal(result.conditions.measured, false);
});

test('rejects missing evidence, foreign owners, and malformed counters', () => {
	assert.throws(() => summarizeFrameworkCoverage({ total: counters(1, 1) }, root), /No framework/);
	assert.throws(
		() =>
			summarizeFrameworkCoverage({ [path.join(root, 'apps/example.ts')]: counters(1, 1) }, root),
		/Unexpected coverage owner/
	);
	for (const [total, covered] of [
		[1, 2],
		[-1, 0],
		[1, -1],
		[1, 0.5],
		[Infinity, 0],
		[1, undefined]
	])
		assert.throws(
			() =>
				summarizeFrameworkCoverage({ [filename('invalid.ts')]: counters(total, covered) }, root),
			/Invalid statements/
		);
	assert.throws(
		() => summarizeFrameworkCoverage({ [filename('missing.ts')]: {} }, root),
		/Invalid statements/
	);
});
