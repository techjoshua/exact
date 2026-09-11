import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import { controlSsrWorker } from '../src/ssr-worker-controller.mjs';

test('worker telemetry reuses an established connection instead of competing for new admissions', async () => {
	const sockets = new Set();
	const server = createServer((request, response) => {
		sockets.add(request.socket);
		response.setHeader('content-type', 'application/json');
		response.end('{"complete":true}');
	});
	try {
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const worker = { controlUrl: `http://127.0.0.1:${server.address().port}` };
		for (let sample = 0; sample < 3; sample++) {
			assert.deepEqual(await controlSsrWorker(worker, 'telemetry'), { complete: true });
			await setTimeout(20);
		}
		assert.equal(sockets.size, 1);
	} finally {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	}
});

test('unsuccessful worker telemetry remains an error', async () => {
	const server = createServer((_request, response) => {
		response.writeHead(503).end();
	});
	try {
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const worker = { controlUrl: `http://127.0.0.1:${server.address().port}` };
		await assert.rejects(controlSsrWorker(worker, 'telemetry'), /failed with 503/);
	} finally {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	}
});
