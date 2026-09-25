import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

for (const buffered of [false, true]) {
	test(`deployment probe ${buffered ? 'rejects buffering' : 'observes early progress'}`, async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-progress-probe-'));
		const operation = { type: 'invoke', id: 'safe-probe' };
		const frame = (event) => JSON.stringify(event) + '\n';
		const progress = frame({ event: 'progress', index: 0, id: operation.id });
		const final =
			frame({ event: 'result', index: 0, result: { ok: true, id: operation.id } }) +
			frame({ event: 'complete' });
		let requests = 0;
		const timers = new Set();
		const server = createServer(async (request, response) => {
			for await (const _chunk of request) {
				/* Consume the complete POST before responding. */
			}
			requests++;
			assert.equal(request.headers['x-exact-progress'], '1');
			response.writeHead(200, { 'content-type': 'application/x-ndjson' });
			if (!buffered) response.write(progress);
			const timer = setTimeout(() => {
				timers.delete(timer);
				response.end((buffered ? progress : '') + final);
			}, 150);
			timers.add(timer);
		});
		try {
			await writeFile(path.join(root, 'operation.json'), JSON.stringify(operation));
			await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
			const execution = promisify(execFile)(
				process.execPath,
				[
					path.resolve(import.meta.dirname, 'probe-task-progress.mjs'),
					'--url',
					`http://127.0.0.1:${server.address().port}/__exact`,
					'--request',
					path.join(root, 'operation.json'),
					'--minimum-gap-ms',
					'50',
					'--timeout-ms',
					'5000'
				],
				{ timeout: 10000 }
			);
			if (buffered) await assert.rejects(execution, /buffered/);
			else assert.ok(JSON.parse((await execution).stdout).progressBeforeResultMs >= 50);
			assert.equal(requests, 1);
		} finally {
			for (const timer of timers) clearTimeout(timer);
			server.closeAllConnections();
			await new Promise((resolve) => server.close(resolve));
			await rm(root, { recursive: true, force: true });
		}
	});
}
