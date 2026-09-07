import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refreshDocsSsrReport, refreshDocsSsrDiagnostics } from './refresh-docs-ssr-report.mjs';

function fixture() {
	const stats = { mean: 200 / 3, p50: 100 / 3, p75: 100, p95: 100, p99: 100 };
	const lane = {
		requests: 20,
		elapsedMs: 400,
		aggregateRequestsPerSecond: 50,
		windows: [
			{ requests: 10, elapsedMs: 100 },
			{ requests: 10, elapsedMs: 300 }
		],
		requestsPerSecond: stats
	};
	const previous = {
		metadata: { createdAt: 'browser-date' },
		summary: [{}, { label: 'Browser' }],
		browserCharts: [{ title: 'Preserved' }],
		server: { sequential: {}, retention: {}, bars: [], responseComposition: {} }
	};
	const raw = {
		kind: 'framework-comparison-ssr-run',
		correctness: { status: 'passed' },
		complete: true,
		publishable: true,
		createdAt: 'server-date',
		harness: {
			throughputMethod: 'deferred-validation-aggregate-v2',
			saturationConcurrency: [32],
			saturationWindows: 2,
			saturationWindowMs: 100,
			concurrency: 16
		},
		runtimes: {
			node: Object.fromEntries(
				['exact', 'react', 'sveltekit', 'nuxt', 'tanstack-start'].map((id) => [
					id,
					{
						saturation: { 32: structuredClone(lane) },
						concurrent: { burstElapsedSamples: [1, 2] },
						sequential: { client: { totalMs: stats } },
						retention: { checkpoints: [{ requests: 1, memory: { heapUsed: 100 } }] },
						diagnostics: {
							responseBreakdown: Object.fromEntries(
								[
									'semanticMarkupBytes',
									'documentEnvelopeBytes',
									'frameworkMarkerCommentBytes',
									'frameworkIdentityAttributeBytes',
									'hydrationScriptBytes',
									'comparisonDataScriptBytes'
								].map((key) => [key, 1])
							)
						}
					}
				])
			)
		}
	};
	return { previous, raw };
}

test('publishes weighted throughput separately from window statistics and preserves browser provenance', () => {
	const { previous, raw } = fixture();
	const report = refreshDocsSsrReport(previous, raw);
	assert.equal(report.schemaVersion, 2);
	assert.equal(report.server.sustained.series[0].aggregate, 50);
	assert.equal(report.server.sustained.series[0].stats.mean, 200 / 3);
	assert.equal(report.server.burst.series[0].stats.mean, 1.5);
	assert.equal(report.metadata.browserCreatedAt, 'browser-date');
	assert.equal(report.metadata.ssrCreatedAt, 'server-date');
	assert.deepEqual(report.browserCharts, previous.browserCharts);
	assert.equal(report.summary[0].value, '50');
	assert.equal('ordinary' in report.server, false);
});

test('rejects inconsistent accounting and incomplete or historical throughput evidence', () => {
	const { previous, raw } = fixture();
	raw.runtimes.node.exact.saturation[32].aggregateRequestsPerSecond = 100;
	assert.throws(() => refreshDocsSsrReport(previous, raw), /inconsistent throughput/);
	raw.complete = false;
	assert.throws(() => refreshDocsSsrReport(previous, raw), /complete publishable/);
	raw.complete = true;
	delete raw.harness.throughputMethod;
	assert.throws(() => refreshDocsSsrReport(previous, raw), /complete publishable/);
});

test('diagnostic refresh preserves capacity and browser evidence and recomputes complete latency samples', () => {
	const { previous, raw } = fixture();
	raw.harness.sampleCount = 2;
	raw.harness.concurrencyWaves = 2;
	previous.server.sustained = { independent: true };
	for (const entry of Object.values(raw.runtimes.node))
		entry.sequential.samples = [{ totalMs: 2 }, { totalMs: 4 }];
	const report = refreshDocsSsrDiagnostics(previous, raw);
	assert.deepEqual(report.summary, previous.summary);
	assert.deepEqual(report.server.sustained, previous.server.sustained);
	assert.deepEqual(report.browserCharts, previous.browserCharts);
	assert.equal(report.server.sequential.series[0].stats.mean, 3);
	assert.equal(report.metadata.ssrSequentialSamples, 2);
	raw.runtimes.node.exact.sequential.samples.pop();
	assert.throws(() => refreshDocsSsrDiagnostics(previous, raw), /incomplete latency/);
});

test('publishes distinct Bun populations and rejects incomplete Bun evidence', () => {
	const { previous, raw } = fixture();
	raw.harness.sampleCount = 2;
	raw.harness.concurrencyWaves = 2;
	for (const entry of Object.values(raw.runtimes.node))
		entry.sequential.samples = [{ totalMs: 2 }, { totalMs: 4 }];
	raw.environment = { runtimes: { node: 'v26.8.1', bun: '1.4.2' } };
	raw.runtimes.bun = structuredClone(raw.runtimes.node);
	for (const entry of Object.values(raw.runtimes.bun))
		entry.sequential.samples = [{ totalMs: 6 }, { totalMs: 8 }];
	const report = refreshDocsSsrDiagnostics(previous, raw);
	assert.equal(report.server.sequential.series[0].stats.mean, 3);
	assert.equal(report.server.bun.sequential.series[0].stats.mean, 7);
	assert.equal(report.server.bun.sequential.series.length, 5);
	assert.match(report.server.bun.burst.title, /Bun/);
	assert.equal(report.server.bun.runtime, '1.4.2');
	assert.equal(report.server.bun.createdAt, 'server-date');
	const nodeOnly = structuredClone(raw);
	delete nodeOnly.runtimes.bun;
	nodeOnly.createdAt = 'later-node-date';
	const refreshed = refreshDocsSsrDiagnostics(report, nodeOnly);
	assert.equal(refreshed.server.bun.createdAt, 'server-date');
	assert.equal(refreshed.metadata.ssrCreatedAt, 'later-node-date');
	assert.match(report.server.bun.retention.comment, /JavaScriptCore/);
	assert.deepEqual(report.browserCharts, previous.browserCharts);
	raw.runtimes.bun.exact.sequential.samples.pop();
	assert.throws(() => refreshDocsSsrDiagnostics(previous, raw), /incomplete latency/);
});
