import assert from 'node:assert/strict';
import test from 'node:test';

import {
	compareComponentLocalTargetAbiCheckpoints,
	compareComponentLocalTargetAbiMeasurements,
	validateComponentLocalTargetAbiMeasurementTable
} from './comparison.mjs';

const metric = (value, unit = 'ms') => ({
	unit,
	p50: value,
	p75: value + 1,
	p95: value + 2,
	p99: value + 3
});

const table = (exact, react, svelte) => ({
	suite: 'browser',
	participants: [
		{ name: 'exact', metrics: { readiness: metric(exact), bytes: metric(100, 'bytes') } },
		{ name: 'react', metrics: { readiness: metric(react), bytes: metric(200, 'bytes') } },
		{ name: 'svelte', metrics: { readiness: metric(svelte), bytes: metric(300, 'bytes') } }
	]
});

test('rejects partial participant and percentile evidence', () => {
	const partial = table(10, 20, 30);
	delete partial.participants[1].metrics.bytes;
	assert.throws(
		() => validateComponentLocalTargetAbiMeasurementTable(partial),
		/incomplete metrics/
	);

	const missingPercentile = table(10, 20, 30);
	delete missingPercentile.participants[0].metrics.readiness.p99;
	assert.throws(
		() => validateComponentLocalTargetAbiMeasurementTable(missingPercentile),
		/omitted finite p99/
	);
});

test('normalizes historical eXact values with stable controls', () => {
	const comparison = compareComponentLocalTargetAbiMeasurements({
		before: table(10, 20, 40),
		current: table(9, 22, 44),
		controls: ['react', 'svelte'],
		deterministicMetrics: ['bytes']
	});
	const readiness = comparison.rows.find(
		(row) => row.metric === 'readiness' && row.percentile === 'p50'
	);
	assert.equal(readiness.controlFactor, 1.1);
	assert.equal(readiness.normalizedBefore, 11);
	assert.equal(readiness.rawDelta, -1);
	assert.ok(Math.abs(readiness.rawDeltaRatio + 0.1) < Number.EPSILON);
	assert.equal(readiness.delta, -2);
	assert.equal(readiness.eligibility, 'eligible');
	const bytes = comparison.rows.find((row) => row.metric === 'bytes' && row.percentile === 'p50');
	assert.equal(bytes.controlFactor, undefined);
	assert.equal(bytes.normalizedBefore, 100);
	assert.equal(bytes.eligibility, 'deterministic');
});

test('never normalizes built-in code and function inventory metrics', () => {
	const inventoryTable = (exact, react, svelte) => ({
		suite: 'startup',
		participants: [
			{
				name: 'exact',
				metrics: {
					compiledFunctionCount: metric(exact, 'count'),
					executedCodeBytes: metric(exact * 100, 'bytes')
				}
			},
			{
				name: 'react',
				metrics: {
					compiledFunctionCount: metric(react, 'count'),
					executedCodeBytes: metric(react * 100, 'bytes')
				}
			},
			{
				name: 'svelte',
				metrics: {
					compiledFunctionCount: metric(svelte, 'count'),
					executedCodeBytes: metric(svelte * 100, 'bytes')
				}
			}
		]
	});
	const comparison = compareComponentLocalTargetAbiMeasurements({
		before: inventoryTable(10, 20, 30),
		current: inventoryTable(9, 40, 60),
		controls: ['react', 'svelte']
	});

	for (const row of comparison.rows) {
		assert.equal(row.eligibility, 'deterministic');
		assert.equal(row.controlFactor, undefined);
	}
	assert.equal(
		comparison.rows.find(
			(row) => row.metric === 'compiledFunctionCount' && row.percentile === 'p50'
		).normalizedBefore,
		10
	);
});

test('rejects normalization when control movement disagrees beyond the dispersion rule', () => {
	const current = table(9, 21, 80);
	const comparison = compareComponentLocalTargetAbiMeasurements({
		before: table(10, 20, 40),
		current,
		controls: ['react', 'svelte'],
		maxControlRatio: 1.2
	});
	const readiness = comparison.rows.find(
		(row) => row.metric === 'readiness' && row.percentile === 'p50'
	);
	assert.equal(readiness.eligibility, 'control-dispersion');
	assert.equal(readiness.controlFactor, undefined);
	assert.equal(readiness.normalizedBefore, 10);
	assert.ok(Math.abs(readiness.rawDeltaRatio + 0.1) < Number.EPSILON);
});

test('compares every accepted checkpoint suite without silently dropping a lane', () => {
	const suite = (name, exact) => {
		const measurement = table(exact, 20, 30);
		measurement.suite = name;
		return { table: measurement, sampleCount: 2, warmupCount: 0 };
	};
	const baseline = { eligibleForSeries: true, suites: [suite('browser', 10), suite('ssr', 5)] };
	const current = { eligibleForSeries: true, suites: [suite('browser', 9), suite('ssr', 4)] };
	const result = compareComponentLocalTargetAbiCheckpoints({
		baseline,
		current,
		baselineLabel: 'P0',
		controlsBySuite: { browser: ['react', 'svelte'], ssr: ['react', 'svelte'] }
	});
	assert.deepEqual(
		result.map((entry) => entry.suite),
		['browser', 'ssr']
	);
	assert.throws(
		() =>
			compareComponentLocalTargetAbiCheckpoints({
				baseline,
				current: { ...current, suites: [current.suites[0]] },
				baselineLabel: 'P0',
				controlsBySuite: { browser: ['react', 'svelte'] }
			}),
		/changed its suite inventory/
	);
});

test('resolves the controlled browser eXact participant without renaming recorded evidence', () => {
	const controlled = (value) => ({
		suite: 'browser',
		participants: [
			{ name: 'exact-controlled', metrics: { readiness: metric(value) } },
			{ name: 'react-controlled', metrics: { readiness: metric(20) } },
			{ name: 'sveltekit-controlled', metrics: { readiness: metric(30) } }
		]
	});
	const baseline = {
		eligibleForSeries: true,
		suites: [{ table: controlled(10) }]
	};
	const current = {
		eligibleForSeries: true,
		suites: [{ table: controlled(9) }]
	};
	const [comparison] = compareComponentLocalTargetAbiCheckpoints({
		baseline,
		current,
		baselineLabel: 'P0',
		controlsBySuite: { browser: ['react-controlled', 'sveltekit-controlled'] }
	});

	assert.equal(comparison.rows[0].beforeRaw, 10);
	assert.equal(comparison.rows[0].current, 9);
});

test('retains exact-only history without manufacturing control normalization', () => {
	const exactOnly = (value) => ({
		suite: 'compiler',
		mode: 'exact-only',
		participants: [{ name: 'exact', metrics: { readiness: metric(value) } }]
	});
	const result = compareComponentLocalTargetAbiMeasurements({
		before: exactOnly(10),
		current: exactOnly(9),
		controls: []
	});
	assert.equal(result.rows[0].eligibility, 'exact-only');
	assert.equal(result.rows[0].controlFactor, undefined);
	assert.equal(result.rows[0].normalizedBefore, 10);
});
