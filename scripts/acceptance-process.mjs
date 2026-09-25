import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { promisify } from 'node:util';

/** Runs a finite Node command with bounded captured diagnostics and no compiler override. */
export async function runAcceptanceCommand(args, cwd, environment = process.env) {
	const env = { ...environment };
	delete env.EXACT_COMPILER_EXECUTABLE;
	delete env.NODE_PATH;
	try {
		return await promisify(execFile)(process.execPath, args, {
			cwd,
			env,
			maxBuffer: 16 * 1024 * 1024
		});
	} catch (error) {
		throw new Error(`${args.join(' ')} failed\n${error.stdout}\n${error.stderr}`, { cause: error });
	}
}

/**
 * Owns one production Node host, including startup failure and bounded shutdown.
 * Readiness has a 30-second default startup deadline and allows up to five seconds per SSR probe.
 * Every probe releases its response body, and every terminal path reaps the owned process.
 */
export async function withAcceptanceServer(
	cwd,
	work,
	{ entry = 'dist/server/server.js', environment = process.env, startupTimeoutMs = 30_000 } = {}
) {
	assert.ok(
		Number.isSafeInteger(startupTimeoutMs) && startupTimeoutMs > 0,
		'Invalid startup timeout'
	);
	const reservation = createServer();
	reservation.listen(0, '127.0.0.1');
	await once(reservation, 'listening');
	const port = reservation.address().port;
	await new Promise((resolve) => reservation.close(resolve));
	const child = spawn(process.execPath, [entry], {
		cwd,
		env: { ...environment, PORT: String(port) },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let output = '';
	let startupError;
	const capture = (chunk) => {
		output = (output + chunk).slice(-65536);
	};
	child.stdout.on('data', capture);
	child.stderr.on('data', capture);
	const exited = new Promise((resolve) => {
		child.once('exit', resolve);
		child.once('error', (error) => {
			startupError = error;
			resolve();
		});
	});
	const origin = `http://127.0.0.1:${port}/`;
	try {
		let ready = false;
		let lastProbe = 'no response';
		// Keep the last HTTP status even if the final, deadline-limited probe times out.
		let lastHttpResponse;
		let lastProbeError;
		const started = performance.now();
		const deadline = started + startupTimeoutMs;
		let attempts = 0;
		// Allow cold SSR to finish instead of repeatedly cancelling a healthy rendering host.
		// One monotonic deadline bounds both slow probes and connection-refused retries.
		while (performance.now() < deadline) {
			attempts++;
			if (startupError) throw startupError;
			assert.equal(child.exitCode, null, output);
			try {
				const remaining = Math.max(1, Math.ceil(deadline - performance.now()));
				const response = await fetch(origin, {
					signal: AbortSignal.timeout(Math.min(5_000, remaining))
				});
				ready = response.ok;
				lastProbe = `HTTP ${response.status} ${response.statusText}`;
				lastHttpResponse = lastProbe;
				lastProbeError = undefined;
				await response.body?.cancel();
			} catch (error) {
				lastProbe = String(error);
				lastProbeError = error;
			}
			if (ready) break;
			const remaining = deadline - performance.now();
			if (remaining > 0)
				await new Promise((resolve) => setTimeout(resolve, Math.min(100, remaining)));
		}
		if (!ready)
			throw new Error(
				`Production host failed to become ready after ${Math.round(performance.now() - started)}ms (${attempts} probes). Last probe: ${lastProbe}${lastHttpResponse ? `. Last HTTP response: ${lastHttpResponse}` : ''}\n${output}`,
				{ cause: lastProbeError }
			);
		await work(origin);
	} finally {
		if (child.exitCode === null) child.kill('SIGTERM');
		const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
		try {
			await exited;
		} finally {
			clearTimeout(timer);
		}
	}
}
