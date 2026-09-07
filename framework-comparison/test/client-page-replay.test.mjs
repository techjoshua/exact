import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { captureClientPage, startClientPageReplay } from '../src/client-page-replay.mjs';

test('replays frozen HTML and assets over HTTP after the renderer stops', async (t) => {
	const directory = await mkdtemp(join(tmpdir(), 'client-replay-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await writeFile(join(directory, 'app.js'), 'original asset');
	let renders = 0;
	const html = '<h1>Checkout authorization failures</h1><script>window.fixture = 1</script>';
	const live = createServer((_, response) => {
		renders++;
		response.writeHead(200, {
			'content-type': 'text/html',
			'content-security-policy': "default-src 'self'"
		});
		response.end(html);
	});
	t.after(() => {
		live.closeAllConnections();
		live.close();
	});
	await new Promise((done) => live.listen(0, '127.0.0.1', done));
	const capture = await captureClientPage({
		id: 'fixture',
		directory,
		url: `http://127.0.0.1:${live.address().port}`
	});
	live.closeAllConnections();
	await new Promise((done) => live.close(done));
	await writeFile(join(directory, 'app.js'), 'changed asset');
	const replay = await startClientPageReplay(capture);
	t.after(() => replay.close());
	for (let i = 0; i < 3; i++) {
		const response = await fetch(`${replay.url}/incidents/inc-100`);
		assert.equal(await response.text(), html);
		assert.equal(response.headers.get('content-security-policy'), "default-src 'self'");
		assert.equal(response.headers.get('cache-control'), 'no-store');
	}
	assert.equal(await (await fetch(`${replay.url}/app.js?v=1`)).text(), 'original asset');
	assert.equal(renders, 1);
	assert.equal(replay.evidence().documentRequests, 3);
	assert.equal(capture.manifest.find((entry) => entry.path === '/app.js').sha256.length, 64);
	assert.equal((await fetch(`${replay.url}/missing.js`)).status, 404);
	assert.throws(() => replay.evidence(), /replay misses/);
});
