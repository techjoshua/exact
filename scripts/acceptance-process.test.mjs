import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
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

test('readiness permits cold SSR longer than one second and releases the host', async (t) => {
	const root = await fixture(
		t,
		`import {createServer} from 'node:http'; let requests=0; createServer((req,res)=>{const request=++requests; const timer=setTimeout(()=>res.end(JSON.stringify({pid:process.pid,request})),1100); res.once('close',()=>clearTimeout(timer));}).listen(Number(process.env.PORT),'127.0.0.1');`
	);
	let pid;
	await withAcceptanceServer(
		root,
		async (origin) => {
			const response = await (await fetch(origin)).json();
			pid = response.pid;
			assert.equal(
				response.request,
				2,
				'the first accepted probe must complete without restarting SSR'
			);
		},
		{ startupTimeoutMs: 5_000 }
	);
	assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('a hung readiness probe obeys the startup deadline and releases its host', async (t) => {
	const root = await fixture(
		t,
		`import {createServer} from 'node:http'; import {writeFileSync} from 'node:fs'; writeFileSync('host.pid',String(process.pid)); createServer(()=>{}).listen(Number(process.env.PORT),'127.0.0.1');`
	);
	await assert.rejects(
		withAcceptanceServer(root, () => assert.fail('must not run'), { startupTimeoutMs: 2_000 }),
		/Last probe: TimeoutError/
	);
	const pid = Number(await readFile(path.join(root, 'host.pid'), 'utf8'));
	assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('readiness retries HTTP failures before entering the journey', async (t) => {
	const root = await fixture(
		t,
		`import {createServer} from 'node:http'; let attempts=0; createServer((req,res)=>{res.statusCode=++attempts < 3 ? 503 : 200; res.end(JSON.stringify({pid:process.pid,attempts}));}).listen(Number(process.env.PORT),'127.0.0.1');`
	);
	let pid;
	await withAcceptanceServer(root, async (origin) => {
		const response = await (await fetch(origin)).json();
		pid = response.pid;
		assert.equal(response.attempts, 4);
	});
	assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('persistent HTTP failure reports status and releases the host', async (t) => {
	const root = await fixture(
		t,
		`import {createServer} from 'node:http'; import {writeFileSync} from 'node:fs'; writeFileSync('host.pid',String(process.pid)); createServer((req,res)=>{res.statusCode=503; res.end('warming');}).listen(Number(process.env.PORT),'127.0.0.1');`
	);
	await assert.rejects(
		withAcceptanceServer(root, () => assert.fail('must not run'), { startupTimeoutMs: 1500 }),
		/Last HTTP response: HTTP 503/
	);
	const pid = Number(await readFile(path.join(root, 'host.pid'), 'utf8'));
	assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('readiness cancels streaming response bodies before the journey', async (t) => {
	const root = await fixture(
		t,
		`import {createServer} from 'node:http'; let probes=0, closed=0; createServer((req,res)=>{if(req.url==='/status'){res.end(JSON.stringify({pid:process.pid,probes,closed}));return;} probes++;res.writeHead(200);res.write('ready');res.on('close',()=>closed++);}).listen(Number(process.env.PORT),'127.0.0.1');`
	);
	let pid;
	await withAcceptanceServer(root, async (origin) => {
		let status;
		for (let attempt = 0; attempt < 100; attempt++) {
			status = await (await fetch(new URL('/status', origin))).json();
			if (status.closed === 1) break;
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		pid = status.pid;
		assert.equal(status.probes, 1);
		assert.equal(status.closed, 1);
	});
	assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('a host ignoring graceful shutdown is forcibly reaped', async (t) => {
	const root = await fixture(
		t,
		`import {createServer} from 'node:http'; process.on('SIGTERM',()=>{}); createServer((req,res)=>res.end(String(process.pid))).listen(Number(process.env.PORT),'127.0.0.1');`
	);
	let pid;
	await withAcceptanceServer(root, async (origin) => {
		pid = Number(await (await fetch(origin)).text());
	});
	assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
