import assert from 'node:assert/strict';
import test from 'node:test';
import {
	percentile,
	summarizeBuildSamples,
	summarizeScenario,
	summarizeValues
} from './measurement.mjs';

test('uses nearest-rank percentiles for isolated process samples', () => {
	assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
	assert.equal(percentile([1, 2, 3, 4, 5], 0.95), 5);
	assert.deepEqual(summarizeValues([5, 1, 3]), {
		p50: 3,
		median: 3,
		p75: 5,
		p95: 5,
		p99: 5,
		min: 1,
		max: 5
	});
});

test('summarizes stable metric units and module evaluation independently', () => {
	const summary = summarizeScenario('client.scalar-update', [
		{
			scenario: 'client.scalar-update',
			moduleEvaluationMs: 10,
			metrics: { updateMs: 2, operations: 1 },
			units: { updateMs: 'ms', operations: 'count' }
		},
		{
			scenario: 'client.scalar-update',
			moduleEvaluationMs: 12,
			metrics: { updateMs: 4, operations: 1 },
			units: { updateMs: 'ms', operations: 'count' }
		}
	]);

	assert.equal(summary.moduleEvaluationMs.median, 10);
	assert.equal(summary.metrics.updateMs.p95, 4);
	assert.equal(summary.units.operations, 'count');
});

test('rejects missing samples, non-finite values, and unit drift', () => {
	assert.throws(() => summarizeScenario('missing', []), /at least one sample/);
	assert.throws(
		() =>
			summarizeScenario('invalid', [
				{
					moduleEvaluationMs: 1,
					metrics: { elapsedMs: Number.NaN },
					units: { elapsedMs: 'ms' }
				}
			]),
		/invalid metric/
	);
	assert.throws(
		() =>
			summarizeScenario('drift', [
				{
					moduleEvaluationMs: 1,
					metrics: { size: 1 },
					units: { size: 'bytes' }
				},
				{
					moduleEvaluationMs: 2,
					metrics: { size: 2 },
					units: { size: 'count' }
				}
			]),
		/changed the unit/
	);
});

test('summarizes deterministic production build samples', () => {
	const bytes = { browser: { raw: 10, gzip: 8, brotli: 6 } };
	const summary = summarizeBuildSamples([
		{ elapsedMs: 12, bytes },
		{ elapsedMs: 10, bytes }
	]);
	assert.equal(summary.elapsedMs.median, 10);
	assert.deepEqual(summary.bytes, bytes);
	assert.throws(
		() =>
			summarizeBuildSamples([
				{ elapsedMs: 10, bytes },
				{ elapsedMs: 11, bytes: { browser: { raw: 11, gzip: 8, brotli: 6 } } }
			]),
		/nondeterministic/
	);
});
