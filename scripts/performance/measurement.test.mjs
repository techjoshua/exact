import assert from 'node:assert/strict';
import test from 'node:test';
import {
	percentile,
	summarizeBuildSamples,
	summarizeScenario,
	summarizeValues
} from './measurement.mjs';
import { summarizeServerLoad } from './server-load-measurement.mjs';

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

test('summarizes sustained server latency, throughput, and post-GC drift', () => {
	const summary = summarizeServerLoad({
		runtime: 'node',
		moduleEvaluationMs: 5,
		requestSamples: [
			{ statusCode: 200, latencyMs: 4, ttfbMs: 3, serverRenderMs: 2, bytes: 100 },
			{ statusCode: 200, latencyMs: 8, ttfbMs: 6, serverRenderMs: 5, bytes: 100 }
		],
		elapsedMs: 100,
		server: {
			requestCount: 2,
			errorCount: 0,
			loopDelays: [0.1, 0.5],
			peakMemory: { heapUsed: 30, rss: 40 }
		},
		baselineMemory: { heapUsed: 10, rss: 20 },
		serverSnapshots: [
			{ currentMemory: { heapUsed: 12, rss: 24 } },
			{ currentMemory: { heapUsed: 14, rss: 26 } }
		]
	});

	assert.equal(summary.throughputRequestsPerSecond, 20);
	assert.equal(summary.latencyMs.p50, 4);
	assert.equal(summary.ttfbMs.p95, 6);
	assert.equal(summary.memory.postGcHeapDriftBytes, 2);
	assert.equal(summary.memory.postGcRssDriftBytes, 2);
});
