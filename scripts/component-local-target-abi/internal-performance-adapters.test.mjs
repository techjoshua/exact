import assert from 'node:assert/strict';
import test from 'node:test';

import { adaptComponentLocalTargetAbiInternalPerformance } from './internal-performance-adapters.mjs';

const summary = (value) => ({ p50: value, p75: value, p95: value, p99: value });
const scenarioSummary = {
	scenario: 'client.scalar-update',
	moduleEvaluationMs: summary(1),
	metrics: { updateMs: summary(2) },
	units: { updateMs: 'ms' }
};
const scenarioSample = {
	scenario: 'client.scalar-update',
	moduleEvaluationMs: 1,
	metrics: { updateMs: 2 },
	units: { updateMs: 'ms' }
};

function markers() {
	return {
		REACTIVE_BENCHMARK_JSON: {
			environment: { warmups: 1 },
			results: [
				{
					name: 'scalar',
					medianMs: 1,
					p75Ms: 1,
					p95Ms: 1,
					p99Ms: 1,
					rawTimingsMs: [1]
				}
			]
		},
		DOM_LIST_BENCHMARK_JSON: {
			summary: scenarioSummary,
			rawSamples: [scenarioSample]
		},
		EXACT_FRAMEWORK_BENCHMARK_JSON: {
			complete: true,
			fixtureBuild: {
				elapsedMs: summary(1),
				bytes: { client: { raw: 2, gzip: 3, brotli: 4 } }
			},
			raw: {
				build: [{ elapsedMs: 1, bytes: { client: { raw: 2, gzip: 3, brotli: 4 } } }],
				node: [{ scenario: 'client.scalar-update', samples: [scenarioSample] }]
			},
			node: [scenarioSummary],
			chromium: {
				results: [scenarioSummary],
				rawSamples: [
					{
						evaluationMs: 1,
						results: {
							'client.scalar-update': { metrics: { updateMs: 2 }, units: { updateMs: 'ms' } }
						}
					}
				]
			}
		},
		COMPILER_BENCHMARK_JSON: {
			semantic: { ...summary(1), rawTimingsMs: [1], rebuilds: 0, semanticDiagnostics: 0 },
			syntax: { ...summary(1), rawTimingsMs: [1], rebuilds: 0, semanticDiagnostics: 0 }
		},
		THEME_BENCHMARK_JSON: {
			checks: [{ name: 'resolution', budget: 10, samplesMs: [1] }]
		},
		DEVTOOLS_BENCHMARK_JSON: {
			measurements: { queryMs: 1 },
			budgets: { queryMs: 10 }
		},
		REACT_COMPAT_BENCHMARK_JSON: {
			results: [
				{
					baseline: '19.2',
					p50Ms: 1,
					p75Ms: 1,
					p95Ms: 1,
					p99Ms: 1,
					rawSamples: [{ durationMs: 1, bytes: 2 }]
				}
			]
		}
	};
}

test('adapts every internal performance lane with exact-only raw populations', () => {
	const suites = adaptComponentLocalTargetAbiInternalPerformance(markers());
	assert.equal(suites.length, 9);
	assert.ok(suites.every((suite) => suite.table.mode === 'exact-only'));
	assert.ok(suites.every((suite) => suite.responseIdentity.status === 'inapplicable'));
	assert.ok(
		suites.some((suite) => suite.table.suite === 'internal-framework-chromium-client-scalar-update')
	);
});

test('rejects an internal benchmark that discarded its raw observations', () => {
	const candidate = markers();
	delete candidate.COMPILER_BENCHMARK_JSON.semantic.rawTimingsMs;
	assert.throws(
		() => adaptComponentLocalTargetAbiInternalPerformance(candidate),
		/compiler benchmark omitted raw timings/
	);
});
