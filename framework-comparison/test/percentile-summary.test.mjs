import assert from 'node:assert/strict';
import test from 'node:test';
import {
	comparisonPercentiles,
	summarizePercentiles,
	summarizeSampleMetric
} from '../src/percentile-summary.mjs';

test('publishes the common comparison percentiles in stable order', () => {
	assert.deepEqual(comparisonPercentiles, [
		['p50', 0.5],
		['p75', 0.75],
		['p95', 0.95],
		['p99', 0.99]
	]);
});

test('uses nearest-rank percentiles without mutating the samples', () => {
	const values = [5, 1, 4, 2, 3];
	assert.deepEqual(summarizePercentiles(values), { mean: 3, p50: 3, p75: 4, p95: 5, p99: 5 });
	assert.deepEqual(values, [5, 1, 4, 2, 3]);
});

test('filters unavailable measurements consistently', () => {
	assert.deepEqual(
		summarizeSampleMetric([{ value: 1 }, { value: null }], (sample) => sample.value),
		{
			mean: 1,
			p50: 1,
			p75: 1,
			p95: 1,
			p99: 1
		}
	);
	assert.deepEqual(summarizePercentiles([null, Number.NaN]), {
		mean: null,
		p50: null,
		p75: null,
		p95: null,
		p99: null
	});
});
