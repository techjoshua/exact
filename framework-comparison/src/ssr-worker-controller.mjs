import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { ssrWorkerNetworkEnvironment } from './ssr-run-environment.mjs';

/** Starts one owned SSR runtime process and resolves after its production transport is listening. */
export async function startSsrWorker({
	runtime,
	participantId,
	transport,
	workerPath,
	workingDirectory,
	serviceUrl,
	environment = {}
}) {
	const startedAt = performance.now();
	const arguments_ = [...runtime.arguments, workerPath, participantId, '0', runtime.id, transport];
	const child = spawn(runtime.command, arguments_, {
		cwd: workingDirectory,
		env: {
			...process.env,
			...ssrWorkerNetworkEnvironment(runtime.id),
			NODE_ENV: 'production',
			COMPARISON_SERVICE_URL: serviceUrl,
			NITRO_SHUTDOWN_DISABLED: 'true',
			...environment
		},
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true
	});
	let stderr = '';
	let stdout = '';
	child.stderr.setEncoding('utf8');
	child.stdout.setEncoding('utf8');
	child.stderr.on('data', (chunk) => (stderr = `${stderr}${chunk}`.slice(-32_000)));
	const ready = await waitUntilReady(
		child,
		runtime.id,
		participantId,
		() => stderr || stdout,
		(chunk) => {
			stdout = `${stdout}${chunk}`.slice(-32_000);
			return stdout;
		}
	);
	if (ready.transport !== transport)
		throw new Error(
			`SSR worker transport mismatch for ${runtime.id}/${participantId}: expected ${transport}, received ${ready.transport}`
		);
	return {
		child,
		participantId,
		runtimeId: runtime.id,
		startupMs: performance.now() - startedAt,
		url: `http://127.0.0.1:${ready.port}/incidents/inc-101`,
		controlUrl: `http://127.0.0.1:${ready.port}/__exact-benchmark`,
		stderr: () => stderr
	};
}

/** Requests graceful shutdown and reaps the exact process owned by the controller. */
export async function stopSsrWorker(worker) {
	if (worker.child.exitCode !== null) return;
	try {
		const response = await fetch(`${worker.controlUrl}/shutdown`, {
			method: 'POST',
			headers: { connection: 'close' },
			signal: AbortSignal.timeout(3_000)
		});
		await response.arrayBuffer();
	} catch {
		// The worker may close its listener before the client consumes the acknowledgement.
	}
	if (await waitForExit(worker.child, 3_000)) return;
	worker.child.kill('SIGTERM');
	if (await waitForExit(worker.child, 2_000)) return;
	worker.child.kill('SIGKILL');
	if (!(await waitForExit(worker.child, 2_000)))
		throw new Error(
			`Unable to stop SSR worker ${worker.runtimeId}/${worker.participantId}: ${worker.stderr()}`
		);
}

/** Calls one private worker-control endpoint with a bounded response deadline. */
export async function controlSsrWorker(worker, operation) {
	const response = await fetch(`${worker.controlUrl}/${operation}`, {
		method: operation === 'reset' ? 'POST' : 'GET',
		headers: { connection: 'close' },
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok) throw new Error(`SSR worker ${operation} failed with ${response.status}`);
	return response.json();
}

async function waitUntilReady(child, runtimeId, participantId, errorOutput, appendStdout) {
	return new Promise((resolveReady, rejectReady) => {
		const timeout = setTimeout(
			() => rejectReady(new Error(`SSR worker startup timed out: ${runtimeId}/${participantId}`)),
			30_000
		);
		child.once('error', (error) => {
			clearTimeout(timeout);
			rejectReady(error);
		});
		child.once('exit', (code, signal) => {
			clearTimeout(timeout);
			rejectReady(
				new Error(
					`SSR worker exited before ready (${runtimeId}/${participantId}, code=${code}, signal=${signal}): ${errorOutput()}`
				)
			);
		});
		child.stdout.on('data', (chunk) => {
			for (const line of appendStdout(chunk).split(/\r?\n/)) {
				if (!line.startsWith('EXACT_SSR_BENCHMARK:')) continue;
				const message = JSON.parse(line.slice('EXACT_SSR_BENCHMARK:'.length));
				if (message.type !== 'ready') continue;
				clearTimeout(timeout);
				resolveReady(message);
				return;
			}
		});
	});
}

function waitForExit(child, timeoutMs) {
	if (child.exitCode !== null) return Promise.resolve(true);
	return new Promise((resolveExit) => {
		const onExit = () => {
			clearTimeout(timeout);
			resolveExit(true);
		};
		const timeout = setTimeout(() => {
			child.removeListener('exit', onExit);
			resolveExit(false);
		}, timeoutMs);
		child.once('exit', onExit);
	});
}
