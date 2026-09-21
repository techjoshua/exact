import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeSsrCapacityCapture } from '../src/ssr-capacity-report.mjs';
import { createSsrCapacityReport } from '../src/publish-ssr-capacity.mjs';
import { validateSsrArrivalPlan, ssrArrivalCases } from '../src/ssr-arrival-plan.mjs';

function fixture() {
	return {
		complete: true,
		blocks: [0, 1].map((population) => ({
			population,
			id: 'exact',
			telemetryErrors: [],
			results: [0, 1].map((driver) => ({
				complete: true,
				identity: { bytes: 10, hash: 'fixture' },
				driver: { pid: driver + 1 },
				stages: [
					{
						name: 'c16',
						mode: 'concurrency',
						concurrency: 8,
						durationMs: 1000,
						startedAt: new Date(driver * 100).toISOString(),
						elapsedMs: 1000,
						offered: 100,
						started: 100,
						completed: 100,
						valid: 100,
						errors: 0,
						missedLag: 0,
						missedCapacity: 0,
						missedDeadline: 0,
						distributions: { responseMs: { p99: driver + 2 } }
					}
				]
			}))
		}))
	};
}

function publicationFixture(runtimeId) {
	const capture = fixture();
	capture.runtimeId = runtimeId;
	capture.transports = { exact: 'bun-fetch', react: 'bun-fetch' };
	capture.environment = {
		platform: 'win32',
		runtimes: { node: 'v26.8.1', bun: '1.4.2' },
		cpu: { model: 'Test CPU' }
	};
	capture.artifacts = {
		exact: { sha256: 'exact' },
		react: { sha256: 'react' },
		server: { hash: 'server' },
		nodeAdapter: { hash: 'node' },
		bunAdapter: { hash: 'bun' }
	};
	capture.plan = { preloaded: true, stages: [{ durationMs: 1000 }] };
	capture.blocks.push(
		...structuredClone(capture.blocks).map((block) => ({ ...block, id: 'react' }))
	);
	for (const block of capture.blocks)
		for (const result of block.results)
			result.plan = { url: 'http://localhost/?__benchmarkPreloaded=true' };
	const multi = structuredClone(capture),
		arrivals = structuredClone(capture),
		normal = structuredClone(capture);
	normal.plan.preloaded = false;
	for (const block of normal.blocks)
		for (const result of block.results) result.plan.url = 'http://localhost/';
	for (const block of arrivals.blocks)
		for (const result of block.results) {
			result.stages[0].mode = 'arrival';
			result.stages[0].rate = 100;
		}
	return { preloaded: { multi, arrivals }, normal };
}

test('target-rate warmup errors remain visible without entering measured arrival rows', () => {
	const { preloaded, normal } = publicationFixture('node');
	for (const block of preloaded.arrivals.blocks)
		for (const result of block.results)
			result.stages.unshift({
				...structuredClone(result.stages[0]),
				name: 'warm-target',
				discard: true,
				errors: 5,
				valid: 95
			});
	const report = createSsrCapacityReport(preloaded, normal);
	assert.equal(report.warmupRequestErrors, 40);
	assert.match(report.validation, /40 request errors.*including 40 during warmup/);
	assert.ok(report.arrivals.every((row) => row.requestErrors === 0));
});

test('publishes isolated rate cases with their own warmup and measurement durations', () => {
	const { preloaded, normal } = publicationFixture('node');
	const template = preloaded.arrivals.blocks[0];
	const plan = validateSsrArrivalPlan();
	preloaded.arrivals.plan = plan;
	preloaded.arrivals.blocks = ssrArrivalCases(plan).map(({ stages, ...entry }, index) => ({
		...structuredClone(template),
		...entry,
		workerPid: index + 100,
		results: template.results.map((result) => ({
			...structuredClone(result),
			stages: stages.map((stage) => ({
				...structuredClone(result.stages[0]),
				...stage,
				elapsedMs: stage.durationMs
			}))
		}))
	}));
	const report = createSsrCapacityReport(preloaded, normal);
	assert.equal(report.arrivals.length, 4);
	assert.deepEqual(report.arrivalsIsolation, { warmupMs: 30000, measurementMs: 60000 });
	assert.match(report.method, /30 s target-rate warmup and 60 s measurement in fresh worker/);
	preloaded.arrivals.blocks[0].results[0].stages[0].rate = 1;
	assert.throws(() => createSsrCapacityReport(preloaded, normal), /Invalid rate/);
});

test('capacity publication labels target runtimes and rejects mixed runtime or adapter evidence', () => {
	for (const runtimeId of ['node', 'bun']) {
		const { preloaded, normal } = publicationFixture(runtimeId);
		assert.equal(
			createSsrCapacityReport(preloaded, normal).runtime,
			runtimeId === 'bun' ? 'Bun 1.4.2' : 'Node v26.8.1'
		);
	}
	const { preloaded, normal } = publicationFixture('bun');
	preloaded.multi.runtimeId = 'node';
	assert.throws(() => createSsrCapacityReport(preloaded, normal), /target runtime/);
	preloaded.multi.runtimeId = 'bun';
	preloaded.multi.artifacts.bunAdapter.hash = 'different';
	assert.throws(() => createSsrCapacityReport(preloaded, normal));
	preloaded.multi.artifacts.bunAdapter.hash = 'bun';
	preloaded.multi.transports.react = 'node-http';
	assert.throws(() => createSsrCapacityReport(preloaded, normal), /native transports/);
});

test('capacity report counts simultaneous drivers over their combined time span', () => {
	const [row] = summarizeSsrCapacityCapture(fixture());
	assert.equal(row.concurrency, 16);
	assert.equal(row.rps, (400 / 2200) * 1000);
	assert.equal(row.p99Min, 2);
	assert.equal(row.p99Max, 3);
});

test('capacity publication rejects incomplete, inconsistent, and mismatched captures', () => {
	for (const alter of [
		(capture) => {
			capture.complete = false;
		},
		(capture) => {
			capture.blocks[0].results[0].stages[0].valid--;
		},
		(capture) => {
			capture.blocks[1].results[0].identity.hash = 'different';
		},
		(capture) => {
			capture.blocks.push(capture.blocks[0]);
		}
	]) {
		const capture = fixture();
		alter(capture);
		assert.throws(() => summarizeSsrCapacityCapture(capture));
	}
});

test('arrival errors remain visible and reduce valid throughput without weakening concurrency admission', () => {
	const capture = fixture();
	for (const block of capture.blocks)
		for (const result of block.results) {
			const stage = result.stages[0];
			stage.valid = 95;
			stage.errors = 5;
		}
	assert.throws(() => summarizeSsrCapacityCapture(capture, { allowArrivalErrors: true }));
	for (const block of capture.blocks)
		for (const result of block.results) {
			result.stages[0].mode = 'arrival';
			result.stages[0].rate = 100;
		}
	assert.throws(() => summarizeSsrCapacityCapture(capture));
	const [row] = summarizeSsrCapacityCapture(capture, { allowArrivalErrors: true });
	assert.equal(row.requestErrors, 20);
	assert.equal(row.requestErrorPercent, 5);
	assert.equal(row.rps, (380 / 2200) * 1000);
	capture.blocks[0].results[0].stages[0].valid++;
	assert.throws(() => summarizeSsrCapacityCapture(capture, { allowArrivalErrors: true }));
});
