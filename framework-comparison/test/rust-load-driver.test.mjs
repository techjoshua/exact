import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { setTimeout as pause } from 'node:timers/promises';
import { startSsrLoadProcess } from '../src/ssr-load-process-owner.mjs';
import { hashStableSsrResponse } from '../src/artifact-integrity.mjs';

const enabled = process.env.EXACT_TEST_RUST_DRIVER === '1';
const contract = (name, work) => test(name, { skip: !enabled }, work);

/** Owns HTTP fixtures and cancels every response socket before closing the listener. */
async function fixture(t, handle) {
	let requests = 0;
	const ports = new Set();
	const server = createServer((request, response) => {
		ports.add(request.socket.remotePort);
		handle(++requests, response, request);
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	t.after(async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});
	return { url: `http://127.0.0.1:${server.address().port}/`, ports };
}

/** Registers driver cleanup before running either implementation against the same contract. */
async function run(t, implementation, plan) {
	const driver = await startSsrLoadProcess('driver', { implementation });
	t.after(() => driver.close());
	driver.run(plan);
	const result = await driver.result;
	await driver.close();
	return result;
}

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
		'invalid',
		'errors',
		'timeouts',
		'missedLag',
		'missedCapacity',
		'missedDeadline'
	])
		assert.equal(
			stage[key],
			stage.intervals.reduce((sum, row) => sum + row[key], 0)
		);
}
const stage = { name: 'check', mode: 'concurrency', concurrency: 1, durationMs: 70 };

contract(
	'Node and Rust drain streamed UTF-8 bytes, validate identity and reuse connections',
	async (t) => {
		const bytes = Buffer.from('complete 🍀 response');
		for (const implementation of ['node', 'rust']) {
			const { url, ports } = await fixture(t, (_n, response) => {
				response.write(bytes.subarray(0, 11));
				response.end(bytes.subarray(11));
			});
			const result = await run(t, implementation, {
				url,
				stages: [stage],
				contains: '',
				expectedIdentity: { bytes: bytes.length, hash: hashStableSsrResponse(bytes) }
			});
			assert.ok(result.stages[0].valid > 0);
			assert.equal(result.stages[0].errors, 0);
			assert.equal(ports.size, 1);
			accounting(result.stages[0]);
		}
	}
);

contract('Rust matches the existing participant-specific timestamp normalization', async (t) => {
	const marker = 'name="framework-participant" content="tanstack-start"';
	for (const body of [marker + ' u:123,s: x_u:456,s: üu:789,s:', 'unrelated u:123,s:']) {
		const { url } = await fixture(t, (_n, response) => response.end(body));
		const result = await run(t, 'rust', { url, stages: [stage] });
		assert.equal(result.identity.hash, hashStableSsrResponse(Buffer.from(body)));
	}
});

contract('both drivers reject wrong preflight identity and never follow redirects', async (t) => {
	for (const implementation of ['node', 'rust']) {
		const good = await fixture(t, (_n, response) => response.end('data'));
		await assert.rejects(
			run(t, implementation, {
				url: good.url,
				stages: [stage],
				expectedIdentity: { bytes: 4, hash: 'wrong' }
			}),
			/identity mismatch/u
		);
		const redirect = await fixture(t, (_n, response) => {
			response.writeHead(302, { location: good.url });
			response.end();
		});
		await assert.rejects(
			run(t, implementation, { url: redirect.url, stages: [stage] }),
			/preflight failed/u
		);
	}
});

contract('both drivers send the same HTTP header set without implicit negotiation', async (t) => {
	for (const implementation of ['node', 'rust']) {
		let headers;
		const { url } = await fixture(t, (_n, response, request) => {
			headers = request.headers;
			response.end('ok');
		});
		await run(t, implementation, { url, stages: [stage] });
		assert.deepEqual(Object.keys(headers).sort(), ['connection', 'host']);
		assert.equal(headers.connection, 'keep-alive');
	}
});

contract(
	'both drivers classify full-body mutation, status, body limits and partial-body timeouts',
	async (t) => {
		for (const implementation of ['node', 'rust'])
			for (const failure of ['hash', 'status', 'limit', 'timeout']) {
				const { url } = await fixture(t, (n, response) => {
					if (n === 1) return response.end('good');
					if (failure === 'timeout') {
						response.write('go');
						return;
					}
					if (failure === 'status') response.statusCode = 503;
					response.end(failure === 'hash' ? 'evil' : failure === 'limit' ? 'too large' : 'good');
				});
				const result = await run(t, implementation, {
					url,
					stages: [stage],
					maxResponseBytes: 4,
					timeoutMs: 30
				});
				const measured = result.stages[0];
				assert.ok(measured.errors > 0);
				const code = {
					hash: 'LOAD_HASH_MISMATCH',
					status: 'HTTP_503',
					limit: 'LOAD_BODY_LIMIT',
					timeout: 'LOAD_TIMEOUT'
				}[failure];
				assert.equal(measured.errorDetails.counts[code], measured.errors);
				assert.equal(measured.errorDetails.total, measured.errors);
				accounting(measured);
			}
	}
);

contract(
	'both drivers preserve offered ramp demand, capacity misses and post-cutoff drain',
	async (t) => {
		for (const implementation of ['node', 'rust']) {
			const { url } = await fixture(t, (n, response) => {
				if (n === 1) response.end('data');
				else setTimeout(() => response.end('data'), 60);
			});
			const result = await run(t, implementation, {
				url,
				maxInFlight: 1,
				stages: [{ name: 'ramp', mode: 'arrival', rate: 1000, endRate: 2000, durationMs: 100 }]
			});
			const measured = result.stages[0];
			assert.equal(measured.offered, 150);
			assert.ok(measured.missedCapacity > 0);
			assert.ok(measured.maxInFlight <= 1);
			assert.ok(measured.completed > measured.completedDuringAdmission);
			assert.equal(measured.errors, 0);
			accounting(measured);
		}
	}
);

contract(
	'closing the Rust owner cancels pending sockets and rejects incomplete results',
	async (t) => {
		const { url } = await fixture(t, (n, response) => {
			if (n === 1) response.end('data');
			else response.write('da');
		});
		const driver = await startSsrLoadProcess('driver', { implementation: 'rust' });
		t.after(() => driver.close());
		driver.run({ url, timeoutMs: 120000, stages: [{ ...stage, durationMs: 60000 }] });
		const rejected = assert.rejects(driver.result, /owner closed stdin|exited/u);
		await pause(50);
		await driver.close();
		await rejected;
		assert.notEqual(driver.child.exitCode, null);
	}
);

contract('Rust exits when its coordinator dies without running cleanup', async (t) => {
	const { url } = await fixture(t, (n, response) => {
		if (n === 1) response.end('data');
		else response.write('da');
	});
	const module = new URL('../src/rust-load-process-owner.mjs', import.meta.url).href;
	const plan = { url, timeoutMs: 120000, stages: [{ ...stage, durationMs: 60000 }] };
	const script = `import { startRustLoadProcess } from ${JSON.stringify(module)};
const driver = await startRustLoadProcess();
driver.run(${JSON.stringify(plan)});
console.log(JSON.stringify({ pid: driver.child.pid }));
await driver.result;`;
	const parent = spawn(process.execPath, ['--input-type=module', '-e', script], {
		stdio: ['ignore', 'pipe', 'ignore']
	});
	let pid;
	t.after(() => {
		parent.kill('SIGKILL');
		if (pid)
			try {
				process.kill(pid, 'SIGKILL');
			} catch {}
	});
	const lines = createInterface({ input: parent.stdout });
	try {
		const line = await Promise.race([
			once(lines, 'line'),
			pause(5000).then(() => {
				throw new Error('Coordinator did not start');
			})
		]);
		pid = JSON.parse(line[0]).pid;
		const stopped = once(parent, 'exit');
		parent.kill('SIGKILL');
		await stopped;
		for (let attempt = 0; attempt < 100; attempt++) {
			try {
				process.kill(pid, 0);
				if (
					process.platform === 'linux' &&
					/\) Z /u.test(await readFile(`/proc/${pid}/stat`, 'utf8'))
				) {
					pid = undefined;
					return;
				}
			} catch (error) {
				if (error.code === 'ESRCH' || error.code === 'ENOENT') {
					pid = undefined;
					return;
				}
				throw error;
			}
			await pause(20);
		}
		assert.fail('Rust driver survived coordinator death');
	} finally {
		lines.close();
	}
});
