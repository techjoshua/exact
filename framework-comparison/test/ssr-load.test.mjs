import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as pause } from 'node:timers/promises';
import { runSsrLoadPlan } from '../src/ssr-load-driver.mjs';
import { arrivalDemand, arrivalOffsetMs, validateSsrLoadPlan } from '../src/ssr-load-plan.mjs';
import { SsrPhaseTotals } from '../src/ssr-load-statistics.mjs';
import { startSsrLoadProcess } from '../src/ssr-load-process-owner.mjs';
import { createLoadErrorLog } from '../src/ssr-load-errors.mjs';

/** Owns a real HTTP fixture and its sockets; request one is the untimed identity preflight. */
async function fixture(t, handle = (_number, response) => response.end('fixture')) {
	let requests = 0;
	const server = createServer((_request, response) => handle(++requests, response));
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	t.after(async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});
	return `http://127.0.0.1:${server.address().port}/`;
}

/** Verifies conservation of demand and completion, including generator overload and interval drain. */
function accounting(stage) {
	assert.equal(
		stage.offered,
		stage.started + stage.missedLag + stage.missedCapacity + stage.missedDeadline
	);
	assert.equal(stage.started, stage.completed);
	assert.equal(stage.completed, stage.valid + stage.errors);
	for (const key of [
		'offered',
		'started',
		'completed',
		'valid',
		'errors',
		'missedLag',
		'missedCapacity',
		'missedDeadline'
	])
		assert.equal(
			stage[key],
			stage.intervals.reduce((sum, row) => sum + row[key], 0)
		);
}

test('linear arrival ramps preserve scheduled demand independently of completion', () => {
	for (const endRate of [50, 100, 200]) {
		const stage = { rate: 100, endRate, durationMs: 2000 };
		assert.equal(arrivalDemand(stage, 2000), 100 + endRate);
		for (let index = 0; index < 100 + endRate; index++)
			assert.ok(Math.abs(arrivalDemand(stage, arrivalOffsetMs(stage, index)) - index) < 1e-8);
	}
	assert.throws(() => validateSsrLoadPlan({ url: 'file:///tmp', stages: [] }), /HTTP/);
	assert.throws(
		() =>
			validateSsrLoadPlan({
				url: 'http://localhost',
				stages: [{ name: 'a', mode: 'arrival', rate: 0, durationMs: 100 }]
			}),
		/Arrival/
	);
});

test('failure storms keep bounded samples and reconcile overflow code counts', () => {
	const log = createLoadErrorLog();
	for (let index = 0; index < 1000; index++) log.record({ code: `FAILURE_${index}` });
	const result = log.snapshot();
	assert.equal(result.total, 1000);
	assert.equal(result.samples.length, 32);
	assert.equal(result.omittedSamples, 968);
	assert.equal(Object.keys(result.counts).length, 33);
	assert.equal(
		Object.values(result.counts).reduce((a, b) => a + b, 0),
		1000
	);
	assert.equal(result.counts.OTHER, 968);
});

test('bounded worker phase totals reset and do not retain individual samples', () => {
	const totals = new SsrPhaseTotals();
	for (let i = 0; i < 10000; i++) totals.push(i);
	assert.deepEqual(totals.snapshot(), { count: 10000, sum: 49995000, min: 0, max: 9999 });
	totals.length = 0;
	assert.deepEqual(totals.snapshot(), { count: 0, sum: 0, min: null, max: null });
	totals.push(3);
	assert.deepEqual(totals.snapshot(), { count: 1, sum: 3, min: 3, max: 3 });
});

test('concurrency load validates all responses and drains owned requests', async (t) => {
	const url = await fixture(t);
	const result = await runSsrLoadPlan({
		url,
		stages: [{ name: 'capacity', mode: 'concurrency', concurrency: 3, durationMs: 120 }]
	});
	const stage = result.stages[0];
	accounting(stage);
	assert.ok(stage.valid > 0);
	assert.equal(stage.errors, 0);
	assert.equal(stage.maxInFlight, 3);
	assert.equal(stage.intervals.at(-1).inFlight, 0);
});

test('sparse demand retires idle pooled sockets within the configured timeout', async (t) => {
	const ports = new Set();
	const url = await fixture(t, (_number, response) => {
		ports.add(response.socket.remotePort);
		response.end('fixture');
	});
	const stage = (
		await runSsrLoadPlan({
			url,
			timeoutMs: 250,
			maxLagMs: 250,
			stages: [{ name: 'sparse', mode: 'arrival', rate: 1, durationMs: 1500 }]
		})
	).stages[0];
	accounting(stage);
	assert.equal(stage.errors, 0);
	assert.equal(stage.valid, 2);
	// An unbounded free pool keeps all sparse requests on the original socket until the server closes it.
	assert.ok(ports.size >= 2, 'Idle sockets must expire before the next sparse request');
});

test('scheduled overload counts missed arrivals instead of falling back to closed-loop demand', async (t) => {
	const url = await fixture(t, (n, response) =>
		n === 1 ? response.end('fixture') : setTimeout(() => response.end('fixture'), 70)
	);
	const stage = (
		await runSsrLoadPlan({
			url,
			maxInFlight: 2,
			stages: [{ name: 'overload', mode: 'arrival', rate: 1000, durationMs: 160 }]
		})
	).stages[0];
	accounting(stage);
	assert.equal(stage.offered, 160);
	assert.ok(stage.missedCapacity > 0);
	assert.ok(stage.started < 20);
	assert.ok(stage.maxInFlight <= 2);
});

test('stalled scheduling records missed demand, without releasing a catch-up burst', async (t) => {
	const url = await fixture(t);
	let stalled = false;
	const stage = (
		await runSsrLoadPlan(
			{
				url,
				maxLagMs: 10,
				stages: [{ name: 'stall', mode: 'arrival', rate: 100, durationMs: 1150 }]
			},
			{
				onInterval: () => {
					if (stalled) return;
					stalled = true;
					const end = performance.now() + 80;
					while (performance.now() < end) {
						/* Inject a known driver stall. */
					}
				}
			}
		)
	).stages[0];
	accounting(stage);
	assert.equal(stage.offered, 115);
	assert.ok(stage.missedLag > 0);
});

test('invalid responses and absolute timeouts remain visible in completed-request accounting', async (t) => {
	const invalid = await fixture(t, (n, response) => response.end(n === 1 ? 'fixture' : 'changed'));
	const stage = (
		await runSsrLoadPlan({
			url: invalid,
			stages: [{ name: 'invalid', mode: 'concurrency', concurrency: 1, durationMs: 80 }]
		})
	).stages[0];
	accounting(stage);
	assert.equal(stage.invalid, stage.completed);
	assert.equal(stage.valid, 0);
	assert.equal(stage.errorDetails.counts.LOAD_HASH_MISMATCH, stage.errors);
	const hanging = await fixture(t, (n, response) => {
		if (n === 1) response.end('fixture');
		else response.write('f');
	});
	const timeout = (
		await runSsrLoadPlan({
			url: hanging,
			timeoutMs: 40,
			stages: [{ name: 'timeout', mode: 'concurrency', concurrency: 1, durationMs: 70 }]
		})
	).stages[0];
	accounting(timeout);
	assert.ok(timeout.timeouts > 0);
	assert.equal(timeout.timeouts, timeout.errors);
	assert.equal(timeout.errorDetails.counts.LOAD_TIMEOUT, timeout.errors);
});

test('cancellation closes admission and pending HTTP work', async (t) => {
	const url = await fixture(t, (n, response) => {
		if (n === 1) response.end('fixture');
	});
	const abort = new AbortController();
	const running = runSsrLoadPlan(
		{ url, stages: [{ name: 'cancel', mode: 'arrival', rate: 100, durationMs: 5000 }] },
		{ signal: abort.signal }
	);
	await pause(50);
	abort.abort();
	await assert.rejects(running, /abort/i);
});

test('response allocation stays bounded when a peer exceeds the body limit', async (t) => {
	const url = await fixture(t, (n, response) =>
		response.end(n === 1 ? 'fixture' : 'x'.repeat(4096))
	);
	const stage = (
		await runSsrLoadPlan({
			url,
			maxResponseBytes: 64,
			stages: [{ name: 'body-limit', mode: 'concurrency', concurrency: 1, durationMs: 80 }]
		})
	).stages[0];
	accounting(stage);
	assert.equal(stage.valid, 0);
	assert.ok(stage.errors > 0);
	assert.equal(stage.errorDetails.counts.LOAD_BODY_LIMIT, stage.errors);
});

test('socket failures retain codes, timestamps, connection reuse and bounded samples', async (t) => {
	const url = await fixture(t, (n, response) => {
		if (n === 1) response.end('fixture');
		else response.socket.destroy();
	});
	const stage = (
		await runSsrLoadPlan({
			url,
			stages: [{ name: 'reset', mode: 'concurrency', concurrency: 4, durationMs: 150 }]
		})
	).stages[0];
	accounting(stage);
	assert.ok(stage.errors > 0);
	assert.equal(stage.errorDetails.total, stage.errors);
	assert.equal(stage.errorDetails.counts.ECONNRESET, stage.errors);
	assert.ok(stage.errorDetails.samples.length <= 32);
	assert.equal(stage.errorDetails.omittedSamples + stage.errorDetails.samples.length, stage.errors);
	for (const sample of stage.errorDetails.samples) {
		assert.equal(sample.phase, 'request');
		assert.equal(typeof sample.reusedSocket, 'boolean');
		assert.ok(Number.isFinite(Date.parse(sample.at)));
		assert.ok(sample.offsetMs >= 0);
	}
	assert.equal(
		stage.intervals.reduce((sum, interval) => sum + interval.errorDetails.total, 0),
		stage.errors
	);
});

test('driver runs in a separate owned process and is reaped on completion or cancellation', async (t) => {
	const url = await fixture(t);
	const child = await startSsrLoadProcess('driver');
	t.after(() => child.close());
	assert.notEqual(child.pid, process.pid);
	child.run({
		url,
		stages: [{ name: 'owned', mode: 'concurrency', concurrency: 1, durationMs: 80 }]
	});
	const result = await child.result;
	accounting(result.stages[0]);
	await child.close();
	assert.ok(child.child.exitCode !== null || child.child.signalCode !== null);
	const cancelled = await startSsrLoadProcess('driver');
	t.after(() => cancelled.close());
	cancelled.run({
		url,
		stages: [{ name: 'cancel', mode: 'arrival', rate: 100, durationMs: 5000 }]
	});
	await pause(80);
	await cancelled.close();
	await assert.rejects(cancelled.result, /exited/);
	assert.ok(cancelled.child.exitCode !== null || cancelled.child.signalCode !== null);
});

test('owned processes do not inherit coordinator-only execution flags', async (t) => {
	const saved = process.execArgv;
	let child;
	try {
		process.execArgv = [...saved, '--input-type=module'];
		child = await startSsrLoadProcess('driver');
	} finally {
		process.execArgv = saved;
	}
	t.after(() => child.close());
	await child.close();
	assert.ok(child.child.exitCode !== null || child.child.signalCode !== null);
});
