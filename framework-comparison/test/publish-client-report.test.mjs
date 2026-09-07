import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshClientReport } from '../src/publish-client-report.mjs';
import { balancedRoundOrder } from '../src/balanced-round-order.mjs';

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

const ids = ['exact', 'react', 'sveltekit', 'nuxt', 'tanstack-start'].map(
	(id) => `${id}-controlled`
);
function raw() {
	return {
		kind: 'framework-comparison-raw-run',
		correctness: { status: 'passed' },
		publishable: true,
		limitations: ['local loopback'],
		createdAt: '2026-09-07T00:00:00Z',
		harness: {
			sampleCount: 30,
			browserWarmupCount: 1,
			sampleOrders: Array.from({ length: 30 }, (_, round) => balancedRoundOrder(ids, round)),
			clientDelivery: {
				mode: 'replay',
				frameworkServersStopped: true,
				cache: 'disabled',
				documentPath: '/incidents/inc-100',
				captures: ids.map((id) => ({
					id,
					documentRequests: 31,
					resources: [{ path: '/incidents/inc-100', sha256: 'a'.repeat(64) }]
				}))
			}
		},
		browser: Object.fromEntries(
			ids.map((id) => [
				id,
				{
					samples: Array.from({ length: 30 }, () => structuredClone(sample)),
					summary,
					response: { hash: 'response', stable: true }
				}
			])
		),
		complexity: ids.map((participantId) => ({ participantId, artifacts: { hash: 'artifact' } }))
	};
}
const previous = {
	metadata: { ssrCreatedAt: 'older' },
	server: { preserved: true },
	summary: [],
	browserCharts: [
		{
			title: 'Warm browser used heap',
			series: ['Exact', 'React', 'SvelteKit', 'Nuxt', 'TanStack Start'].map((name) => ({ name }))
		}
	]
};
test('refreshes browser values from raw samples and preserves independent server evidence', () => {
	const evidence = raw();
	evidence.browser['exact-controlled'].summary = {
		...summary,
		heapBytes: { mean: 999, p50: 999, p75: 999, p95: 999, p99: 999 }
	};
	const report = refreshClientReport(previous, evidence);
	assert.equal(report.browserCharts[0].series[0].stats.mean, 1e-6);
	assert.equal(report.browserCharts[0].series[0].stats.p99, 1e-6);
	assert.deepEqual(report.server, previous.server);
	assert.equal(report.metadata.ssrCreatedAt, 'older');
});
test('rejects live, incomplete, unbalanced, and nonpublishable captures', () => {
	for (const change of [
		(r) => {
			r.harness.clientDelivery.mode = 'live';
		},
		(r) => {
			r.harness.clientDelivery.captures[0].documentRequests = 30;
		},
		(r) => {
			r.harness.sampleOrders[1] = r.harness.sampleOrders[0];
		},
		(r) => {
			r.browser['exact-controlled'].samples.pop();
		},
		(r) => {
			r.publishable = false;
		}
	]) {
		const evidence = raw();
		change(evidence);
		assert.throws(() => refreshClientReport(previous, evidence));
	}
});
