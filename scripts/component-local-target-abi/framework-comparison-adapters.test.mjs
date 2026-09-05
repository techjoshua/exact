import assert from 'node:assert/strict';
import test from 'node:test';

import {
	adaptFrameworkComparisonBrowser,
	adaptFrameworkComparisonBrowserRun,
	adaptFrameworkComparisonSsr,
	adaptFrameworkComparisonStartupCpu
} from './framework-comparison-adapters.mjs';
import { createSsrDiagnosticSuites } from './framework-comparison-ssr-diagnostic-adapter.mjs';

const summary = Object.fromEntries(
	[
		'navigationMs',
		'domContentLoadedMs',
		'loadEventMs',
		'transferredScriptBytes',
		'firstContentfulPaintMs',
		'largestContentfulPaintMs',
		'totalBlockingTimeMs',
		'longTaskCount',
		'longTaskDurationMs',
		'domElementCount',
		'domNodeCount',
		'domCommentCount',
		'domTextCount',
		'heapBytes',
		'jsHeapTotalBytes',
		'embedderHeapUsedBytes',
		'backingStorageBytes',
		'documentCount',
		'retainedNodeCount',
		'eventListenerCount',
		'optimisticFeedbackMs',
		'settlementMs',
		'requestDispatchedMs',
		'sseIncidentReceivedMs',
		'httpHeadersReceivedMs',
		'httpJsonDecodedMs'
	].map((name) => [name, { p50: 1, p75: 1, p95: 1, p99: 1 }])
);
const sample = {
	navigation: {
		durationMs: 1,
		domContentLoadedMs: 1,
		loadEventMs: 1,
		transferredScriptBytes: 1,
		firstContentfulPaintMs: 1
	},
	vitals: {
		largestContentfulPaintMs: 1,
		totalBlockingTimeMs: 1,
		longTaskCount: 1,
		longTaskDurationMs: 1,
		domElementCount: 1,
		domNodeCount: 1,
		domCommentCount: 1,
		domTextCount: 1
	},
	heapBytes: 1,
	memory: {
		jsHeapUsedBytes: 1,
		jsHeapTotalBytes: 1,
		embedderHeapUsedBytes: 1,
		backingStorageBytes: 1,
		documents: 1,
		nodes: 1,
		eventListeners: 1
	},
	optimisticFeedbackMs: 1,
	settlementMs: 1,
	phasesMs: {
		'request-dispatched': 1,
		'sse-incident-received': 1,
		'http-headers-received': 1,
		'http-json-decoded': 1
	},
	responseHash: 'response'
};

function raw(publishable = true) {
	const entry = { samples: [sample], summary, response: { hash: 'response', stable: true } };
	return {
		kind: 'framework-comparison-raw-run',
		correctness: { status: 'passed' },
		publishable,
		harness: { sampleCount: 1, browserWarmupCount: 0 },
		browser: { exact: entry, react: entry },
		build: { exact: { cleanBuildMs: 10 }, react: { cleanBuildMs: 11 } },
		complexity: [
			{
				participantId: 'exact',
				authoredProductionLines: 1,
				authoredTestLines: 2,
				sourceFiles: 3,
				manualTransportSites: 4,
				synchronizationSites: 5,
				artifacts: { hash: 'exact-artifact', rawBytes: 6, gzipBytes: 7, brotliBytes: 8, files: 9 }
			},
			{
				participantId: 'react',
				authoredProductionLines: 1,
				authoredTestLines: 2,
				sourceFiles: 3,
				manualTransportSites: 4,
				synchronizationSites: 5,
				artifacts: { hash: 'react-artifact', rawBytes: 6, gzipBytes: 7, brotliBytes: 8, files: 9 }
			}
		],
		limitations: ['local loopback']
	};
}

test('adapts correctness-gated browser evidence without losing raw metrics', () => {
	const suite = adaptFrameworkComparisonBrowser(raw());
	assert.equal(suite.table.participants[0].metrics.navigationMs.unit, 'ms');
	assert.equal(suite.populations[0].rawSamples[0].samples[0].heapBytes, 1);
	assert.equal(suite.responseHashes.react, 'response');
	assert.equal(suite.sourcePublication.status, 'publishable');
	assert.deepEqual(suite.sourceLimitations, ['local loopback']);
});

test('retains clean-build and deterministic complexity lanes as separate populations', () => {
	const suites = adaptFrameworkComparisonBrowserRun(raw());
	assert.deepEqual(
		suites.map((suite) => suite.table.suite),
		[
			'framework-comparison-browser',
			'framework-comparison-clean-build',
			'framework-comparison-complexity'
		]
	);
	assert.equal(suites[1].table.participants[0].metrics.cleanBuildMs.p99, 10);
	assert.equal(suites[2].table.participants[0].metrics.artifactBrotliBytes.unit, 'bytes');
});

test('retains an explicit non-publishable source status without rejecting valid ABI evidence', () => {
	const suite = adaptFrameworkComparisonBrowser(raw(false));
	assert.equal(suite.sourcePublication.status, 'non-publishable');
	assert.match(suite.sourcePublication.reason, /explicitly marked non-publishable/);
});

test('retains the complete startup performance population', () => {
	const percentile = { p50: 1, p75: 1, p95: 1, p99: 1 };
	const startupSample = {
		firstContentfulPaintMs: 1,
		vitals: {
			largestContentfulPaintMs: 1,
			longTaskCount: 1,
			longTaskDurationMs: 1,
			totalBlockingTimeMs: 1,
			domElementCount: 1,
			domNodeCount: 1,
			domCommentCount: 1,
			domTextCount: 1
		},
		readyMs: 1,
		performance: {
			scriptDurationMs: 1,
			taskDurationMs: 1,
			v8CompileDurationMs: 1,
			layoutDurationMs: 1,
			recalcStyleDurationMs: 1
		},
		memory: {
			jsHeapUsedBytes: 1,
			jsHeapTotalBytes: 1,
			embedderHeapUsedBytes: 1,
			backingStorageBytes: 1,
			documents: 1,
			nodes: 1,
			eventListeners: 1
		},
		trace: {
			markers: { navigationStartFound: true, firstContentfulPaintFound: true, readyFound: true },
			totals: { parseMs: 1, compileMs: 1, evaluationMs: 1 },
			beforeFcp: { parseMs: 1, compileMs: 1, evaluationMs: 1 },
			functionCounts: { parsed: 1, compiled: 1 },
			functionCountsBeforeFcp: { parsed: 1, compiled: 1 }
		},
		scripts: [{ decodedBodySize: 1 }],
		coverage: [{ codeBytes: 1, executedBytes: 1, functionCount: 1, invokedFunctionCount: 1 }]
	};
	const metrics = Object.fromEntries(
		[
			'firstContentfulPaintMs',
			'largestContentfulPaintMs',
			'longTaskCount',
			'longTaskDurationMs',
			'totalBlockingTimeMs',
			'domElementCount',
			'domNodeCount',
			'domCommentCount',
			'domTextCount',
			'readyMs',
			'scriptDurationMs',
			'taskDurationMs',
			'v8CompileDurationMs',
			'layoutDurationMs',
			'recalcStyleDurationMs',
			'jsHeapUsedBytes',
			'jsHeapTotalBytes',
			'embedderHeapUsedBytes',
			'backingStorageBytes',
			'documentCount',
			'retainedNodeCount',
			'eventListenerCount',
			'parseTraceMs',
			'compileTraceMs',
			'evaluationTraceMs',
			'parseBeforeFcpMs',
			'compileBeforeFcpMs',
			'evaluationBeforeFcpMs',
			'parsedFunctionCount',
			'compiledFunctionCount',
			'parsedFunctionBeforeFcpCount',
			'compiledFunctionBeforeFcpCount',
			'decodedScriptBytes',
			'profiledCodeBytes',
			'executedCodeBytes',
			'profiledFunctionCount',
			'invokedFunctionCount',
			'traceMarkerCoverage'
		].map((name) => [name, percentile])
	);
	const suites = adaptFrameworkComparisonStartupCpu({
		kind: 'framework-comparison-startup-cpu-profile',
		correctness: { status: 'passed' },
		publishable: true,
		harness: { sampleCount: 1 },
		artifacts: { exact: 'artifact' },
		profiles: {
			'1x': {
				exact: {
					samples: [startupSample],
					summary: metrics,
					response: { hash: 'response', stable: true }
				}
			}
		},
		limitations: ['local loopback']
	});
	assert.equal(suites[0].table.participants[0].metrics.taskDurationMs.p50, 1);
	assert.equal(suites[0].table.participants[0].metrics.layoutDurationMs.p50, 1);
	assert.equal(suites[0].table.participants[0].metrics.recalcStyleDurationMs.p50, 1);
	assert.equal(suites[0].table.participants[0].metrics.parsedFunctionCount.p50, 1);
	assert.equal(suites[0].table.participants[0].metrics.compiledFunctionCount.p50, 1);
});

test('rejects response-divergent browser evidence', () => {
	const divergent = raw();
	divergent.browser.react = {
		...divergent.browser.react,
		response: { hash: 'different', stable: true }
	};
	assert.throws(() => adaptFrameworkComparisonBrowser(divergent), /responses differ/);
});

test('separates SSR request, throughput, histogram, startup, and retention populations', () => {
	const percentile = (value) => ({ p50: value, p75: value, p95: value, p99: value });
	const lane = (throughput = false) => ({
		samples: [{ ttfbMs: 1, totalMs: 2, bytes: 3 }],
		client: { ttfbMs: percentile(1), totalMs: percentile(2), responseBytes: percentile(3) },
		workerSamples: { firstByteMs: [1], totalMs: [2], userCpuMs: [3], systemCpuMs: [4] },
		worker: {
			firstByteMs: percentile(1),
			totalMs: percentile(2),
			deliveryMs: percentile(1),
			userCpuPerRequestMs: percentile(3),
			systemCpuPerRequestMs: percentile(4),
			totalCpuPerRequestMs: percentile(7)
		},
		cpuPerRequest: { userMs: 3, systemMs: 4, totalMs: 7 },
		eventLoopDelayMs: { ...percentile(1), count: 10, max: 2 },
		garbageCollection: { count: 1, durationMs: 2 },
		...(throughput ? { throughputSamples: [5], requestsPerSecond: percentile(5) } : {})
	});
	const entry = {
		startupSamplesMs: [1],
		startupMs: percentile(1),
		sequential: lane(),
		concurrent: lane(true),
		saturation: { 1: lane(true) },
		diagnostics: { preloadedSaturation: { supported: true, saturation: { 1: lane(true) } } },
		retention: {
			checkpoints: [
				{ requests: 0, memory: { rss: 1, heapTotal: 2, heapUsed: 3, external: 4, arrayBuffers: 5 } }
			],
			postGcBytes: {
				rss: percentile(1),
				heapTotal: percentile(2),
				heapUsed: percentile(3),
				external: percentile(4),
				arrayBuffers: percentile(5)
			},
			bytesPerRequest: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }
		},
		response: { hash: 'stable', stable: true }
	};
	const result = adaptFrameworkComparisonSsr({
		kind: 'framework-comparison-ssr-run',
		correctness: { status: 'passed' },
		publishable: true,
		harness: { startupSampleCount: 1 },
		artifacts: {
			node: {
				exact: { hash: 'a', rawBytes: 1, gzipBytes: 2, brotliBytes: 3, files: 4 },
				react: { hash: 'b', rawBytes: 1, gzipBytes: 2, brotliBytes: 3, files: 4 },
				sveltekit: { hash: 'c', rawBytes: 1, gzipBytes: 2, brotliBytes: 3, files: 4 }
			}
		},
		runtimes: {
			node: {
				exact: entry,
				react: entry,
				sveltekit: {
					...entry,
					diagnostics: { preloadedSaturation: { supported: false } }
				}
			}
		},
		limitations: ['bounded local run']
	});
	assert.deepEqual(
		result.map((suite) => suite.table.suite),
		[
			'framework-comparison-ssr-node-artifacts',
			'framework-comparison-ssr-node-startup',
			'framework-comparison-ssr-node-sequential',
			'framework-comparison-ssr-node-concurrent',
			'framework-comparison-ssr-node-saturation-1',
			'framework-comparison-ssr-node-preloaded-1',
			'framework-comparison-ssr-node-retention'
		]
	);
	assert.deepEqual(
		result[5].table.participants.map((participant) => participant.name),
		['exact', 'react']
	);
	assert.equal(
		result[2].populations.find((population) => population.kind === 'reported').rawSummaries[0]
			.observationCount,
		10
	);
});

test('adapts variable-count SSR attribution lanes without discarding faster participants', () => {
	const percentile = (value) => ({ p50: value, p75: value, p95: value, p99: value });
	const names = ['exact', 'react', 'sveltekit', 'nuxt', 'tanstack-start'];
	const entries = Object.fromEntries(
		names.map((name, index) => {
			const samples = Array.from({ length: index + 1 }, () => ({
				ttfbMs: index + 1,
				totalMs: index + 2,
				bytes: 2048
			}));
			return [
				name,
				{
					diagnostics: {
						payloadSweep: {
							2048: {
								samples,
								client: {
									ttfbMs: percentile(index + 1),
									totalMs: percentile(index + 2),
									responseBytes: percentile(2048)
								},
								throughputSamples: [10, 11],
								requestsPerSecond: {
									p50: 10,
									p75: 11,
									p95: 11,
									p99: 11
								}
							}
						},
						renderOnly:
							index < 2
								? {
										supported: true,
										timing: { samplesMs: [1, 2], responseBytes: 3000 + index }
									}
								: { supported: false }
					}
				}
			];
		})
	);
	const suites = createSsrDiagnosticSuites(
		{
			artifacts: {
				node: Object.fromEntries(names.map((name) => [name, { hash: `${name}-hash` }]))
			}
		},
		'node',
		entries
	);
	const requests = suites[0].populations.find(
		(population) => population.name === 'transport requests'
	);
	assert.equal(requests.kind, 'reported');
	assert.deepEqual(
		requests.rawSummaries.map((entry) => entry.observationCount),
		[1, 2, 3, 4, 5]
	);
	assert.deepEqual(
		suites[1].table.participants.map((participant) => participant.name),
		['exact', 'react']
	);
});
