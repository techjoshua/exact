import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { withAcceptanceServer } from './acceptance-process.mjs';

async function fixture(t, source) {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-host-owner-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(path.join(root, 'dist/server'), { recursive: true });
	await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
	await writeFile(path.join(root, 'dist/server/server.js'), source);
	return root;
}

test('production host exits after a failing browser journey', async (t) => {
	const root = await fixture(
		t,
		`import {createServer} from 'node:http'; const server=createServer((req,res)=>res.end(String(process.pid))); server.listen(Number(process.env.PORT),'127.0.0.1'); process.on('SIGTERM',()=>server.close());`
	);
	let pid;
	await assert.rejects(
		withAcceptanceServer(root, async (origin) => {
			pid = Number(await (await fetch(origin)).text());
			throw new Error('journey failed');
		}),
		/journey failed/
	);
	assert.ok(pid > 0);
	assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
test('startup failure retains host diagnostics and skips the journey', async (t) => {
	const root = await fixture(t, `throw new Error('host failed');`);
	await assert.rejects(
		withAcceptanceServer(root, () => assert.fail('must not run')),
		/host failed/
	);
});

test('production host honors its entry point and isolated environment', async (t) => {
	const root = await fixture(t, `throw new Error('default entry must not run');`);
	await writeFile(
		path.join(root, 'host.mjs'),
		`import {createServer} from 'node:http'; createServer((req,res)=>res.end(process.env.ACCEPTANCE_VALUE ?? 'missing')).listen(Number(process.env.PORT),'127.0.0.1');`
	);
	await withAcceptanceServer(
		root,
		async (origin) => {
			assert.equal(await (await fetch(origin)).text(), 'isolated');
		},
		{ entry: 'host.mjs', environment: { ACCEPTANCE_VALUE: 'isolated' } }
	);
});
