import { brotliCompressSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { cpus, platform, release, totalmem } from 'node:os';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { startComparisonServer } from './server.mjs';
import {
	cpuMillisecondsPerRequest,
	parseSsrConcurrencyLevels,
	retainedBytesPerRequest,
	summarizeSsrSamples,
	summarizeWorkerRequests
} from './ssr-benchmark-statistics.mjs';
import { ssrTransportFor } from './ssr-benchmark-transport.mjs';

if (!process.argv.includes('--correctness-passed'))
	throw new Error('Run `npm run measure:ssr` so correctness gates the SSR benchmark.');

const suiteRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(suiteRoot, '..');
const workerPath = resolve(import.meta.dirname, 'ssr-benchmark-worker.mjs');
const sampleCount = positiveInteger(process.env.COMPARISON_SSR_SAMPLES, 50);
const warmupCount = positiveInteger(process.env.COMPARISON_SSR_WARMUPS, 10);
const startupSampleCount = positiveInteger(process.env.COMPARISON_SSR_STARTUP_SAMPLES, 5);
const concurrency = positiveInteger(process.env.COMPARISON_SSR_CONCURRENCY, 16);
const concurrencyWaves = positiveInteger(process.env.COMPARISON_SSR_CONCURRENCY_WAVES, 8);
const saturationConcurrency = parseSsrConcurrencyLevels(
	process.env.COMPARISON_SSR_SATURATION_CONCURRENCY
);
const saturationWaves = positiveInteger(process.env.COMPARISON_SSR_SATURATION_WAVES, 12);
const retentionBatches = positiveInteger(process.env.COMPARISON_SSR_RETENTION_BATCHES, 5);
const retentionBatchSize = positiveInteger(process.env.COMPARISON_SSR_RETENTION_BATCH_SIZE, 50);
const participants = [
	{ id: 'exact', artifacts: { node: 'dist-server', bun: 'dist-bun-server' } },
	{ id: 'react', artifacts: { node: 'dist-server', bun: 'dist-server' } },
	{ id: 'sveltekit', artifacts: { node: 'build/server', bun: 'build/server' } },
	{ id: 'nuxt', artifacts: { node: '.output/server', bun: '.output/server' } }
];
const runtimes = availableRuntimes();
const participantMetadata = await Promise.all(
	participants.map(async (participant) =>
		JSON.parse(
			await readFile(resolve(suiteRoot, 'participants', participant.id, 'participant.json'), 'utf8')
		)
	)
);
const participantMetadataById = Object.fromEntries(
	participants.map((participant, index) => [participant.id, participantMetadata[index]])
);
const unreviewed = participantMetadata.filter((metadata) => metadata.status !== 'complete');
if (unreviewed.length && !process.argv.includes('--allow-unreviewed'))
	throw new Error(
		`Publishable SSR measurement refused: incomplete or unreviewed participants: ${unreviewed.map((item) => item.id).join(', ')}`
	);
const service = await startComparisonServer();

try {
	const artifacts = Object.fromEntries(
		await Promise.all(
			runtimes.map(async (runtime) => [
				runtime.id,
				Object.fromEntries(
					await Promise.all(
						participants.map(async (participant) => [
							participant.id,
							await measureArtifact(
								resolve(
									suiteRoot,
									'participants',
									participant.id,
									participant.artifacts[runtime.id]
								)
							)
						])
					)
				)
			])
		)
	);
	const results = {};
	for (const runtime of runtimes) {
		results[runtime.id] = {};
		for (const participant of participants) {
			const transport = ssrTransportFor(participantMetadataById[participant.id], runtime.id);
			process.stdout.write(
				`Measuring ${participant.id} SSR on ${runtime.id} through ${transport}...\n`
			);
			results[runtime.id][participant.id] = await measureParticipant(
				runtime,
				participant.id,
				transport
			);
		}
	}
	const report = {
		schemaVersion: 3,
		kind: 'framework-comparison-ssr-run',
		createdAt: new Date().toISOString(),
		correctness: { status: 'passed', command: 'npm run test:e2e' },
		publishable: unreviewed.length === 0,
		environment: environmentMetadata(runtimes),
		harness: {
			sampleCount,
			warmupCount,
			startupSampleCount,
			concurrency,
			concurrencyWaves,
			saturationConcurrency,
			saturationWaves,
			retentionBatches,
			retentionBatchSize,
			percentiles: ['p50', 'p75', 'p95', 'p99'],
			workingTreeDirty: gitStatusDirty()
		},
		artifacts,
		runtimes: results,
		limitations: [
			'Latency uses warm keep-alive requests over unthrottled local loopback.',
			'Every SSR route loads the same fixture through the controlled service before rendering.',
			'Saturation levels measure finite local-loopback waves rather than an externally generated maximum-load plateau.',
			'Post-GC slopes are leak signals across a bounded run, not proof of unbounded retention.',
			'Each participant declares its production transport per runtime; transport identity is recorded with every result.',
			"Frameworks without native Bun hosting remain on Bun's node:http compatibility layer."
		]
	};
	const output = outputPath();
	await mkdir(resolve(output, '..'), { recursive: true });
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
	printSummary(report);
	process.stdout.write(`SSR comparison written to ${relative(repositoryRoot, output)}\n`);
} finally {
	await service.close();
}

/** Measures one framework/runtime pair while retaining exactly one owned worker at a time. */
async function measureParticipant(runtime, participantId, transport) {
	const startupMs = [];
	let worker;
	try {
		for (let index = 0; index < startupSampleCount; index += 1) {
			if (worker) await stopWorker(worker);
			worker = await startWorker(runtime, participantId, transport);
			startupMs.push(worker.startupMs);
		}
		for (let index = 0; index < warmupCount; index += 1) await measureRequest(worker.url);

		await control(worker, 'reset');
		const sequentialBefore = await telemetry(worker);
		const sequentialSamples = [];
		for (let index = 0; index < sampleCount; index += 1)
			sequentialSamples.push(await measureRequest(worker.url));
		const sequentialAfter = await telemetry(worker);
		validateResponses(participantId, sequentialSamples);

		const concurrent = await measureConcurrentLane(
			worker,
			participantId,
			concurrency,
			concurrencyWaves
		);
		const saturation = {};
		for (const level of saturationConcurrency)
			saturation[level] =
				level === concurrency
					? concurrent
					: await measureConcurrentLane(worker, participantId, level, saturationWaves);

		await control(worker, 'reset');
		const retention = [{ requests: 0, ...(await snapshot(worker)) }];
		for (let batch = 1; batch <= retentionBatches; batch += 1) {
			await runConcurrentRequests(worker.url, retentionBatchSize, 1);
			retention.push({ requests: batch * retentionBatchSize, ...(await snapshot(worker)) });
		}

		return {
			transport,
			workerMeasurement:
				transport === 'bun-fetch'
					? 'fetch-handler-response-ready'
					: 'node-response-first-byte-and-finish',
			startupMs: summarizeSsrSamples(startupMs),
			startupSamplesMs: startupMs,
			sequential: summarizeLane(sequentialSamples, sequentialBefore, sequentialAfter, sampleCount),
			concurrent,
			saturation,
			retention: summarizeRetention(retention),
			response: responseIdentity(sequentialSamples)
		};
	} finally {
		if (worker) await stopWorker(worker);
	}
}

/** Measures one bounded concurrency level with independent CPU and scheduler telemetry. */
async function measureConcurrentLane(worker, participantId, level, waves) {
	await control(worker, 'reset');
	const before = await telemetry(worker);
	const samples = [];
	const throughput = [];
	for (let wave = 0; wave < waves; wave += 1) {
		const startedAt = performance.now();
		const waveSamples = await runConcurrentRequests(worker.url, level, level);
		throughput.push((waveSamples.length / (performance.now() - startedAt)) * 1_000);
		samples.push(...waveSamples);
	}
	const after = await telemetry(worker);
	validateResponses(participantId, samples);
	return {
		concurrency: level,
		waves,
		requests: samples.length,
		client: summarizeClientSamples(samples),
		worker: summarizeWorkerRequests(after.statistics),
		requestsPerSecond: summarizeSsrSamples(throughput),
		cpuPerRequest: cpuMillisecondsPerRequest(before.cpu, after.cpu, samples.length),
		eventLoopDelayMs: after.eventLoopDelayMs,
		garbageCollection: after.garbageCollection
	};
}

function summarizeLane(samples, before, after, requests) {
	return {
		requests,
		client: summarizeClientSamples(samples),
		worker: summarizeWorkerRequests(after.statistics),
		cpuPerRequest: cpuMillisecondsPerRequest(before.cpu, after.cpu, requests),
		eventLoopDelayMs: after.eventLoopDelayMs,
		garbageCollection: after.garbageCollection,
		memoryBefore: before.memory,
		memoryAfter: after.memory
	};
}

function summarizeClientSamples(samples) {
	return {
		ttfbMs: summarizeSsrSamples(samples.map((sample) => sample.ttfbMs)),
		totalMs: summarizeSsrSamples(samples.map((sample) => sample.totalMs)),
		responseBytes: summarizeSsrSamples(samples.map((sample) => sample.bytes))
	};
}

function summarizeRetention(checkpoints) {
	const fields = ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'];
	return {
		checkpoints,
		postGcBytes: Object.fromEntries(
			fields.map((field) => [
				field,
				summarizeSsrSamples(checkpoints.map((point) => point.memory[field]))
			])
		),
		bytesPerRequest: Object.fromEntries(
			fields.map((field) => [
				field,
				retainedBytesPerRequest(checkpoints, (point) => point.memory[field])
			])
		)
	};
}

/** Starts one runtime process and resolves only after its production modules are listening. */
async function startWorker(runtime, participantId, transport) {
	const startedAt = performance.now();
	const arguments_ = [...runtime.arguments, workerPath, participantId, '0', runtime.id, transport];
	const child = spawn(runtime.command, arguments_, {
		cwd: suiteRoot,
		env: {
			...process.env,
			NODE_ENV: 'production',
			COMPARISON_SERVICE_URL: service.url,
			NITRO_SHUTDOWN_DISABLED: 'true'
		},
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true
	});
	let stderr = '';
	let stdout = '';
	child.stderr.setEncoding('utf8');
	child.stdout.setEncoding('utf8');
	child.stderr.on('data', (chunk) => (stderr = `${stderr}${chunk}`.slice(-32_000)));
	const ready = await new Promise((resolveReady, rejectReady) => {
		const timeout = setTimeout(
			() => rejectReady(new Error(`SSR worker startup timed out: ${runtime.id}/${participantId}`)),
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
					`SSR worker exited before ready (${runtime.id}/${participantId}, code=${code}, signal=${signal}): ${stderr || stdout}`
				)
			);
		});
		child.stdout.on('data', (chunk) => {
			stdout = `${stdout}${chunk}`.slice(-32_000);
			for (const line of stdout.split(/\r?\n/)) {
				if (!line.startsWith('EXACT_SSR_BENCHMARK:')) continue;
				const message = JSON.parse(line.slice('EXACT_SSR_BENCHMARK:'.length));
				if (message.type !== 'ready') continue;
				clearTimeout(timeout);
				resolveReady(message);
				return;
			}
		});
	});
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

/** Requests graceful shutdown, then terminates the exact owned process if it misses the deadline. */
async function stopWorker(worker) {
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

async function snapshot(worker) {
	return control(worker, 'snapshot');
}

async function telemetry(worker) {
	return control(worker, 'telemetry');
}

async function control(worker, operation) {
	const response = await fetch(`${worker.controlUrl}/${operation}`, {
		method: operation === 'reset' ? 'POST' : 'GET',
		headers: { connection: 'close' },
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok) throw new Error(`SSR worker ${operation} failed with ${response.status}`);
	return response.json();
}

async function runConcurrentRequests(url, count, maximumConcurrency) {
	const samples = new Array(count);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(count, maximumConcurrency) }, async () => {
			while (next < count) {
				const index = next++;
				samples[index] = await measureRequest(url);
			}
		})
	);
	return samples;
}

async function measureRequest(url) {
	const startedAt = performance.now();
	const response = await fetch(url, { headers: { connection: 'keep-alive' } });
	const ttfbMs = performance.now() - startedAt;
	const bytes = Buffer.from(await response.arrayBuffer());
	const totalMs = performance.now() - startedAt;
	if (!response.ok)
		throw new Error(`SSR request failed with ${response.status}: ${bytes.toString('utf8')}`);
	return {
		ttfbMs,
		totalMs,
		bytes: bytes.length,
		hash: createHash('sha256').update(bytes).digest('hex'),
		meaningful: bytes.includes(Buffer.from('Delayed fulfillment events'))
	};
}

function validateResponses(participantId, samples) {
	if (samples.some((sample) => !sample.meaningful))
		throw new Error(`${participantId} SSR response omitted the selected incident`);
	const hashes = new Set(samples.map((sample) => sample.hash));
	if (hashes.size !== 1)
		throw new Error(
			`${participantId} emitted ${hashes.size} response identities for immutable input`
		);
}

function responseIdentity(samples) {
	return { hash: samples[0].hash, bytes: samples[0].bytes, stable: true };
}

function availableRuntimes() {
	const requested = (process.env.COMPARISON_SSR_RUNTIMES ?? 'node,bun')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
	const result = [];
	for (const id of requested) {
		if (id === 'node') {
			result.push({
				id,
				command: process.execPath,
				arguments: ['--expose-gc'],
				version: process.version
			});
			continue;
		}
		if (id === 'bun') {
			const probe = spawnSync(process.env.BUN ?? 'bun', ['--version'], {
				encoding: 'utf8',
				windowsHide: true
			});
			if (probe.status === 0)
				result.push({
					id,
					command: process.env.BUN ?? 'bun',
					arguments: [],
					version: probe.stdout.trim()
				});
			continue;
		}
		throw new Error(`Unknown SSR runtime ${id}`);
	}
	if (!result.length) throw new Error('No requested SSR benchmark runtime is available');
	return result;
}

async function measureArtifact(directory) {
	const files = await allFiles(directory);
	let rawBytes = 0;
	let gzipBytes = 0;
	let brotliBytes = 0;
	for (const file of files) {
		const bytes = await readFile(file);
		rawBytes += bytes.length;
		gzipBytes += gzipSync(bytes).length;
		brotliBytes += brotliCompressSync(bytes).length;
	}
	return { rawBytes, gzipBytes, brotliBytes, files: files.length };
}

async function allFiles(directory) {
	const result = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory()) result.push(...(await allFiles(file)));
		else if ((await stat(file)).isFile() && extname(file) !== '.map') result.push(file);
	}
	return result;
}

function environmentMetadata(runtimeList) {
	const cpu = cpus()[0];
	return {
		platform: platform(),
		platformRelease: release(),
		cpu: cpu ? { model: cpu.model, logicalCount: cpus().length } : null,
		totalMemoryBytes: totalmem(),
		runtimes: Object.fromEntries(runtimeList.map((runtime) => [runtime.id, runtime.version]))
	};
}

function outputPath() {
	if (process.env.COMPARISON_SSR_OUTPUT) return resolve(process.env.COMPARISON_SSR_OUTPUT);
	return resolve(
		suiteRoot,
		'results',
		'raw',
		`ssr-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`
	);
}

function positiveInteger(value, fallback) {
	const parsed = value === undefined ? fallback : Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0)
		throw new TypeError(`Expected a positive integer benchmark option, received ${value}`);
	return parsed;
}

function gitStatusDirty() {
	const result = spawnSync('git', ['status', '--porcelain'], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		windowsHide: true
	});
	return result.status !== 0 || result.stdout.trim().length !== 0;
}

function printSummary(report) {
	for (const [runtimeId, runtime] of Object.entries(report.runtimes)) {
		for (const [participantId, result] of Object.entries(runtime)) {
			process.stdout.write(
				`${runtimeId}/${participantId}: warm total p50=${format(result.sequential.client.totalMs.p50)}ms p95=${format(result.sequential.client.totalMs.p95)}ms, concurrent p50=${format(result.concurrent.client.totalMs.p50)}ms, heap slope=${format(result.retention.bytesPerRequest.heapUsed)} B/request\n`
			);
		}
	}
}

function format(value) {
	return Number.isFinite(value) ? Number(value).toFixed(2) : 'n/a';
}
