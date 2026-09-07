import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeSsrCapacityCapture } from '../src/ssr-capacity-report.mjs';

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
