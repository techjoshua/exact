import assert from 'node:assert/strict';
import test from 'node:test';
import {
	summarizeNativeCoverage,
	summarizeGobcoCoverage,
	mergeNativeCoverageProfiles,
	modifiedPatchLines
} from './coverage.mjs';
import { verifyExecution, validateInventory, resolveInventory } from './evidence.mjs';
import { languageFeatures, contractEdges } from './inventory.mjs';
import { witnesses } from './witnesses.mjs';

test('coverage retains uncovered ranges and weights statements rather than files', () => {
	const result = summarizeNativeCoverage(
		'mode: count\np/internal/exactcompiler/a.go:1.1,2.2 4 0\np/cmd/exactc/main.go:5.2,8.3 6 2\n'
	);
	assert.equal(result.percent, 60);
	assert.equal(result.files[0].uncovered[0].statements, 4);
	for (const profile of [
		'mode: set\n',
		'mode: count\n',
		'mode: count\ninvalid',
		'mode: count\np/internal/other/a.go:1.1,2.2 1 0'
	])
		assert.throws(() => summarizeNativeCoverage(profile));
});

test('execution evidence fails closed on missing, skipped, duplicated or unsuccessful witnesses', () => {
	const witness = [
		{ id: 'edge', file: 'a.test.ts', environment: 'jsdom', tests: ['observes ownership'] }
	];
	const report = {
		success: true,
		testResults: [
			{
				name: '/repo/a.test.ts',
				assertionResults: [{ title: 'observes ownership', status: 'passed' }]
			}
		]
	};
	assert.equal(verifyExecution(report, witness, '/repo')[0].status, 'verified');
	for (const status of ['failed', 'pending', 'skipped', 'todo']) {
		const bad = structuredClone(report);
		bad.testResults[0].assertionResults[0].status = status;
		assert.throws(() => verifyExecution(bad, witness, '/repo'));
	}
	assert.throws(() => verifyExecution({ ...report, success: false }, witness, '/repo'));
	assert.throws(() => verifyExecution({ ...report, testResults: [] }, witness, '/repo'));
	const duplicate = structuredClone(report);
	duplicate.testResults[0].assertionResults.push(duplicate.testResults[0].assertionResults[0]);
	assert.throws(() => verifyExecution(duplicate, witness, '/repo'));
	assert.throws(() => verifyExecution(report, [{ ...witness[0], tests: ['renamed'] }], '/repo'));
});

test('inventory keeps known gaps visible and rejects dangling evidence', () => {
	validateInventory({ witnesses, languageFeatures, contractEdges });
	const entries = resolveInventory(languageFeatures, []);
	assert.ok(entries.every((entry) => entry.status === 'gap'));
	assert.ok(languageFeatures.some((entry) => entry.gap));
	assert.throws(() =>
		validateInventory({
			witnesses,
			languageFeatures: [{ ...languageFeatures[0], witnesses: ['missing'] }],
			contractEdges
		})
	);
});

test('Gobco coverage preserves one-sided outcomes and rejects invalid counters', () => {
	const record = { Start: 'a.go:2:3', Code: 'x != nil', TrueCount: 2, FalseCount: 0 };
	const result = summarizeGobcoCoverage([record], 'branch');
	assert.equal(result.percent, 50);
	assert.deepEqual(result.uncovered, [record]);
	for (const records of [
		[],
		[{ ...record, TrueCount: -1 }],
		[{ ...record, FalseCount: null }],
		[{ ...record, Start: '' }]
	])
		assert.throws(() => summarizeGobcoCoverage(records, 'condition'));
});

test('native execution merges unit and subprocess evidence without inflating the denominator', () => {
	const unit =
		'mode: count\np/internal/exactcompiler/a.go:1.1,2.2 4 1\np/internal/exactcompiler/a.go:3.1,4.2 2 0\n';
	const integration =
		'mode: atomic\np/internal/exactcompiler/a.go:1.1,2.2 4 2\np/internal/exactcompiler/a.go:3.1,4.2 2 1\n';
	const merged = mergeNativeCoverageProfiles([unit, integration]);
	assert.equal(summarizeNativeCoverage(merged).statements, 6);
	assert.equal(summarizeNativeCoverage(merged).percent, 100);
	assert.equal(summarizeNativeCoverage(unit + unit.split('\n').slice(1).join('\n')).statements, 6);
	assert.throws(() => mergeNativeCoverageProfiles([unit, integration.replace('4 2', '5 2')]));
	assert.throws(() => mergeNativeCoverageProfiles([]));
	assert.deepEqual(
		modifiedPatchLines('@@ -3,3 +3,4 @@\n context\n-old\n+// comment\n+new\n retained\n'),
		[5]
	);
});
