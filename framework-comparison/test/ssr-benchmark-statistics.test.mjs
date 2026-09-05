import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	cpuMillisecondsPerRequest,
	parseSsrConcurrencyLevels,
	retainedBytesPerRequest,
	summarizeAvailableWorkerPhases,
	summarizeSsrSamples,
	summarizeWorkerRequests
} from '../src/ssr-benchmark-statistics.mjs';

describe('SSR benchmark statistics', () => {
	it('reports the common nearest-rank percentile set', () => {
		assert.deepEqual(summarizeSsrSamples([1, 2, 3, 4, 5]), {
			mean: 3,
			p50: 3,
			p75: 4,
			p95: 5,
			p99: 5
		});
	});

	it('calculates a retained-memory trend from post-GC checkpoints', () => {
		const slope = retainedBytesPerRequest(
			[
				{ requests: 0, memory: { heapUsed: 1_000 } },
				{ requests: 50, memory: { heapUsed: 1_500 } },
				{ requests: 100, memory: { heapUsed: 2_000 } }
			],
			(point) => point.memory.heapUsed
		);
		assert.equal(slope, 10);
	});

	it('normalizes process CPU deltas and worker request phases', () => {
		assert.deepEqual(
			cpuMillisecondsPerRequest(
				{ user: 100_000, system: 40_000 },
				{ user: 140_000, system: 50_000 },
				10
			),
			{ userMs: 4, systemMs: 1, totalMs: 5 }
		);
		assert.deepEqual(
			summarizeWorkerRequests({
				firstByteMs: [4, 2, 3, 1, 5, 6],
				totalMs: [7, 5, 6, 4, 8, 9],
				userCpuMs: [3, 1, 2, 1, 3, 4],
				systemCpuMs: [2, 1, 1, 1, 0, 2]
			}),
			{
				firstByteMs: { mean: 3.5, p50: 3, p75: 5, p95: 6, p99: 6 },
				totalMs: { mean: 6.5, p50: 6, p75: 8, p95: 9, p99: 9 },
				deliveryMs: { mean: 3, p50: 3, p75: 3, p95: 3, p99: 3 },
				cpuBatchSize: 5,
				userCpuPerRequestMs: { mean: 3, p50: 2, p75: 4, p95: 4, p99: 4 },
				systemCpuPerRequestMs: { mean: 1.5, p50: 1, p75: 2, p95: 2, p99: 2 },
				totalCpuPerRequestMs: { mean: 4.5, p50: 3, p75: 6, p95: 6, p99: 6 },
				phases: {}
			}
		);
	});

	it('summarizes only participant phases with observations', () => {
		assert.deepEqual(
			summarizeAvailableWorkerPhases({
				dataLoadMs: [3, 1, 2],
				dataFetchMs: [2, 0.5, 1],
				dataDecodeMs: [0.4, 0.2, 0.3],
				renderMs: [0.8, 0.7, 0.9],
				envelopeMs: []
			}),
			{
				dataLoadMs: { mean: 2, p50: 2, p75: 3, p95: 3, p99: 3 },
				dataFetchMs: { mean: 7 / 6, p50: 1, p75: 2, p95: 2, p99: 2 },
				dataDecodeMs: { mean: 0.3, p50: 0.3, p75: 0.4, p95: 0.4, p99: 0.4 },
				renderMs: { mean: (0.8 + 0.7 + 0.9) / 3, p50: 0.8, p75: 0.9, p95: 0.9, p99: 0.9 }
			}
		);
	});

	it('normalizes selected saturation levels', () => {
		assert.deepEqual(parseSsrConcurrencyLevels('16,1,4,16'), [1, 4, 16]);
		assert.deepEqual(parseSsrConcurrencyLevels(undefined), [1, 4, 8, 16, 32, 64]);
		assert.throws(() => parseSsrConcurrencyLevels('1,0,4'), /positive integers/);
	});

	it('rejects meaningless CPU normalization', () => {
		assert.throws(
			() => cpuMillisecondsPerRequest({ user: 0, system: 0 }, { user: 1, system: 1 }, 0),
			/positive integer/
		);
	});
});
