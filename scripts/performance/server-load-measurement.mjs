import { spawn } from 'node:child_process';
import { Agent, get } from 'node:http';
import process from 'node:process';
import { summarizeValues } from './measurement.mjs';

const readyMarker = 'EXACT_SERVER_READY=';

/** Runs a sustained production HTTP workload and always reaps its owned server process. */
export async function measureServerLoad({
	worker,
	fixture,
	runtime,
	concurrency,
	warmupRequests,
	rounds,
	roundDurationMs
}) {
	const owned = spawn(runtime === 'bun' ? 'bun' : process.execPath, ['--expose-gc', worker], {
		cwd: process.cwd(),
		env: { ...process.env, EXACT_SERVER_PERFORMANCE_FIXTURE: fixture },
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true
	});
	let stderr = '';
	owned.stderr.setEncoding('utf8');
	owned.stderr.on('data', (chunk) => {
		stderr += chunk;
	});
	const exited = new Promise((resolve) =>
		owned.once('exit', (code, signal) => resolve({ code, signal }))
	);
	let origin;
	try {
		const ready = await waitForReady(owned);
		origin = `http://127.0.0.1:${ready.port}`;
		const agent = new Agent({ keepAlive: true, maxSockets: concurrency });
		try {
			await runFixedRequests(origin, agent, warmupRequests, concurrency);
			const reset = await requestJson(`${origin}/__exact/reset`, agent);
			const requestSamples = [];
			const serverSnapshots = [];
			let nextRequestId = warmupRequests + 1;
			let measuredMs = 0;
			for (let round = 0; round < rounds; round++) {
				const window = await runTimedRequests(
					origin,
					agent,
					concurrency,
					roundDurationMs,
					nextRequestId
				);
				nextRequestId += window.samples.length;
				measuredMs += window.elapsedMs;
				requestSamples.push(...window.samples);
				serverSnapshots.push(await requestJson(`${origin}/__exact/metrics`, agent));
			}
			return summarizeServerLoad({
				runtime,
				moduleEvaluationMs: ready.moduleEvaluationMs,
				requestSamples,
				elapsedMs: measuredMs,
				server: serverSnapshots.at(-1),
				baselineMemory: reset.baselineMemory,
				serverSnapshots
			});
		} finally {
			agent.destroy();
		}
	} finally {
		if (origin) {
			try {
				await requestJson(`${origin}/__exact/shutdown`);
			} catch {
				// The owning process is still force-reaped below if graceful shutdown fails.
			}
		}
		const outcome = await Promise.race([
			exited,
			new Promise((resolve) => setTimeout(() => resolve(undefined), 2_000))
		]);
		if (!outcome) {
			owned.kill('SIGKILL');
			await exited;
		}
		if (owned.exitCode && owned.exitCode !== 0)
			throw new Error(`${runtime} HTTP benchmark server exited with ${owned.exitCode}\n${stderr}`);
	}
}

/** Summarizes client-visible and server-reported measurements from a sustained load window. */
export function summarizeServerLoad({
	runtime,
	moduleEvaluationMs,
	requestSamples,
	elapsedMs,
	server,
	baselineMemory,
	serverSnapshots
}) {
	if (requestSamples.length === 0) throw new Error('Server load benchmark completed no requests');
	const failures = requestSamples.filter((sample) => sample.statusCode !== 200);
	if (failures.length !== 0 || server.errorCount !== 0)
		throw new Error(
			`Server load benchmark observed ${failures.length} client failures and ${server.errorCount} server errors`
		);
	if (server.requestCount !== requestSamples.length)
		throw new Error(
			`Server reported ${server.requestCount} requests for ${requestSamples.length} client samples`
		);
	for (const sample of requestSamples)
		if (!Number.isFinite(sample.serverRenderMs))
			throw new Error('Server load benchmark received an invalid render duration');
	const postGcMemory = serverSnapshots.map((snapshot) => snapshot.currentMemory);
	return {
		runtime,
		requests: requestSamples.length,
		errors: 0,
		throughputRequestsPerSecond: requestSamples.length / (elapsedMs / 1_000),
		moduleEvaluationMs,
		latencyMs: summarizeValues(requestSamples.map((sample) => sample.latencyMs)),
		ttfbMs: summarizeValues(requestSamples.map((sample) => sample.ttfbMs)),
		serverRenderMs: summarizeValues(requestSamples.map((sample) => sample.serverRenderMs)),
		responseBytes: summarizeValues(requestSamples.map((sample) => sample.bytes)),
		eventLoopDelayMs: summarizeValues(server.loopDelays.length > 0 ? server.loopDelays : [0]),
		memory: {
			baselineHeapBytes: baselineMemory.heapUsed,
			baselineRssBytes: baselineMemory.rss,
			peakHeapBytes: server.peakMemory.heapUsed,
			peakRssBytes: server.peakMemory.rss,
			postGcHeapBytes: postGcMemory.map((memory) => memory.heapUsed),
			postGcRssBytes: postGcMemory.map((memory) => memory.rss),
			postGcHeapDriftBytes:
				postGcMemory.length < 2 ? 0 : postGcMemory.at(-1).heapUsed - postGcMemory[0].heapUsed,
			postGcRssDriftBytes:
				postGcMemory.length < 2 ? 0 : postGcMemory.at(-1).rss - postGcMemory[0].rss
		}
	};
}

async function runFixedRequests(origin, agent, count, concurrency) {
	let next = 1;
	await Promise.all(
		Array.from({ length: concurrency }, async () => {
			while (next <= count) await requestRender(origin, agent, next++);
		})
	);
}

async function runTimedRequests(origin, agent, concurrency, durationMs, startingId) {
	const started = performance.now();
	const deadline = started + durationMs;
	let next = startingId;
	const samples = [];
	await Promise.all(
		Array.from({ length: concurrency }, async () => {
			while (performance.now() < deadline) samples.push(await requestRender(origin, agent, next++));
		})
	);
	return { samples, elapsedMs: performance.now() - started };
}

async function requestRender(origin, agent, id) {
	const started = performance.now();
	return await new Promise((resolve, reject) => {
		const request = get(`${origin}/render?id=${id}`, { agent }, (response) => {
			let firstByteMs;
			let bytes = 0;
			response.on('data', (chunk) => {
				firstByteMs ??= performance.now() - started;
				bytes += chunk.length;
			});
			response.once('end', () =>
				resolve({
					statusCode: response.statusCode,
					latencyMs: performance.now() - started,
					ttfbMs: firstByteMs ?? performance.now() - started,
					serverRenderMs: Number(response.headers['x-exact-render-ms']),
					bytes
				})
			);
		});
		request.once('error', reject);
	});
}

async function requestJson(url, agent) {
	return await new Promise((resolve, reject) => {
		const request = get(url, { agent }, (response) => {
			let body = '';
			response.setEncoding('utf8');
			response.on('data', (chunk) => {
				body += chunk;
			});
			response.once('end', () => {
				if (response.statusCode !== 200)
					reject(new Error(`${url} returned ${response.statusCode}`));
				else resolve(JSON.parse(body));
			});
		});
		request.once('error', reject);
	});
}

async function waitForReady(child) {
	child.stdout.setEncoding('utf8');
	return await new Promise((resolve, reject) => {
		let buffered = '';
		const cleanup = () => {
			clearTimeout(timeout);
			child.stdout.off('data', onData);
			child.off('error', onError);
			child.off('exit', onExit);
		};
		const onData = (chunk) => {
			buffered += chunk;
			const line = buffered.split(/\r?\n/).find((candidate) => candidate.startsWith(readyMarker));
			if (!line) return;
			cleanup();
			resolve(JSON.parse(line.slice(readyMarker.length)));
		};
		const onError = (error) => {
			cleanup();
			reject(error);
		};
		const onExit = (code) => {
			cleanup();
			reject(new Error(`HTTP benchmark server exited before ready (${code})`));
		};
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error('HTTP benchmark server did not start'));
		}, 10_000);
		child.stdout.on('data', onData);
		child.once('error', onError);
		child.once('exit', onExit);
	});
}
