import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	cpuMillisecondsPerRequest,
	retainedBytesPerRequest,
	summarizeSsrSamples,
	summarizeWorkerRequests
} from '../src/ssr-benchmark-statistics.mjs';

describe('SSR benchmark statistics', () => {
	it('reports the common nearest-rank percentile set', () => {
		assert.deepEqual(summarizeSsrSamples([1, 2, 3, 4, 5]), {
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
				firstByteMs: { p50: 3, p75: 5, p95: 6, p99: 6 },
				totalMs: { p50: 6, p75: 8, p95: 9, p99: 9 },
				cpuBatchSize: 5,
				userCpuPerRequestMs: { p50: 2, p75: 4, p95: 4, p99: 4 },
				systemCpuPerRequestMs: { p50: 1, p75: 2, p95: 2, p99: 2 },
				totalCpuPerRequestMs: { p50: 3, p75: 6, p95: 6, p99: 6 }
			}
		);
	});

	it('rejects meaningless CPU normalization', () => {
		assert.throws(
			() => cpuMillisecondsPerRequest({ user: 0, system: 0 }, { user: 1, system: 1 }, 0),
			/positive integer/
		);
	});
});
