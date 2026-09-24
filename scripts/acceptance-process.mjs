import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { promisify } from 'node:util';

/** Runs a finite Node command with bounded captured diagnostics and no compiler override. */
export async function runAcceptanceCommand(args, cwd) {
	const env = { ...process.env };
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

/** Owns one production Node host, including startup failure and bounded shutdown. */
export async function withAcceptanceServer(cwd, work) {
	const reservation = createServer();
	reservation.listen(0, '127.0.0.1');
	await once(reservation, 'listening');
	const port = reservation.address().port;
	await new Promise((resolve) => reservation.close(resolve));
	const child = spawn(process.execPath, ['dist/server/server.js'], {
		cwd,
		env: { ...process.env, PORT: String(port) },
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
		for (let attempt = 0; attempt < 150; attempt++) {
			if (startupError) throw startupError;
			assert.equal(child.exitCode, null, output);
			try {
				ready = (await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok;
			} catch {}
			if (ready) break;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		assert.ok(ready, `Production host failed to start:\n${output}`);
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
