import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { it } from 'node:test';
import {
	resetSsrClientConnections,
	runSsrBurst,
	runSustainedSsrWindow
} from '../src/ssr-benchmark-client.mjs';

it('rejects unsuccessful responses after all owned requests have drained', async (context) => {
	let completed = 0;
	let active = 0;
	let maximum = 0;
	const server = createServer((_request, response) => {
		active++;
		maximum = Math.max(maximum, active);
		setTimeout(() => {
			response.writeHead(503);
			response.end('unavailable');
			active--;
			completed++;
		}, 5);
	});
	context.after(async () => {
		resetSsrClientConnections();
		await new Promise((resolve) => server.close(resolve));
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const url = `http://127.0.0.1:${server.address().port}`;
	await assert.rejects(runSsrBurst(url, 6, 2), /503: unavailable/);
	assert.equal(completed, 6);
	assert.equal(active, 0);
	assert.equal(maximum, 2);
	await assert.rejects(runSustainedSsrWindow(url, 2, 10), /503: unavailable/);
	assert.equal(active, 0);
});

it('rejects invalid load populations before opening requests', async () => {
	await assert.rejects(runSsrBurst('http://unused', 0, 1), /positive integer/);
	await assert.rejects(runSsrBurst('http://unused', 1, 129), /through 128/);
	await assert.rejects(runSustainedSsrWindow('http://unused', 0, 10), /through 128/);
	await assert.rejects(runSustainedSsrWindow('http://unused', 1, 0), /duration/);
});
