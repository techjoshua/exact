import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
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
import {
	measureSsrRequest,
	resetSsrClientConnections,
	runConcurrentSsrRequests,
	runSustainedSsrWindow
} from './ssr-benchmark-client.mjs';
import {
	balancedParticipantOrder,
	probeControlledService
} from './ssr-controlled-service-probe.mjs';
import {
	availableSsrRuntimes,
	measureSsrArtifact,
	ssrEnvironmentMetadata
} from './ssr-run-environment.mjs';
import { controlSsrWorker, startSsrWorker, stopSsrWorker } from './ssr-worker-controller.mjs';

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
const capacityPrimeConcurrency = positiveInteger(
	process.env.COMPARISON_SSR_CAPACITY_PRIME_CONCURRENCY,
	32
);
const capacityPrimeMs = positiveInteger(process.env.COMPARISON_SSR_CAPACITY_PRIME_MS, 2_000);
const saturationConcurrency = parseSsrConcurrencyLevels(
	process.env.COMPARISON_SSR_SATURATION_CONCURRENCY
);
const saturationWindows = positiveInteger(process.env.COMPARISON_SSR_SATURATION_WINDOWS, 5);
const saturationWindowMs = positiveInteger(process.env.COMPARISON_SSR_SATURATION_WINDOW_MS, 500);
const serviceProbeRequests = positiveInteger(
	process.env.COMPARISON_SSR_SERVICE_PROBE_REQUESTS,
	100
);
const measurementRound = nonNegativeInteger(process.env.COMPARISON_SSR_MEASUREMENT_ROUND, 0);
const equalPayloadBytes = positiveInteger(process.env.COMPARISON_SSR_EQUAL_PAYLOAD_BYTES, 8_192);
const attributionConcurrency = parseSsrConcurrencyLevels(
	process.env.COMPARISON_SSR_ATTRIBUTION_CONCURRENCY,
	[8, 32, 64]
);
const attributionWindows = positiveInteger(process.env.COMPARISON_SSR_ATTRIBUTION_WINDOWS, 3);
const attributionWindowMs = positiveInteger(process.env.COMPARISON_SSR_ATTRIBUTION_WINDOW_MS, 300);
const payloadSweepBytes = [2_048, 3_072, 3_384, 4_096, 5_120, 6_046, 8_192];
const retentionBatches = positiveInteger(process.env.COMPARISON_SSR_RETENTION_BATCHES, 5);
const retentionBatchSize = positiveInteger(process.env.COMPARISON_SSR_RETENTION_BATCH_SIZE, 50);
const participants = [
	{ id: 'exact', artifacts: { node: 'dist-server', bun: 'dist-bun-server' } },
	{ id: 'react', artifacts: { node: 'dist-server', bun: 'dist-server' } },
	{ id: 'sveltekit', artifacts: { node: 'build/server', bun: 'build/server' } },
	{ id: 'nuxt', artifacts: { node: '.output/server', bun: '.output/server' } }
];
const runtimes = availableSsrRuntimes();
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
							await measureSsrArtifact(
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
	const executionOrder = {};
	const serviceProbes = {};
	for (const [runtimeIndex, runtime] of runtimes.entries()) {
		results[runtime.id] = {};
		serviceProbes[runtime.id] = {};
		const runtimeParticipants = balancedParticipantOrder(
			participants,
			measurementRound,
			runtimeIndex + 1
		);
		executionOrder[runtime.id] = runtimeParticipants.map((participant) => participant.id);
		for (const participant of runtimeParticipants) {
			serviceProbes[runtime.id][participant.id] = await probeControlledService(
				service.url,
				serviceProbeRequests
			);
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
		schemaVersion: 5,
		kind: 'framework-comparison-ssr-run',
		createdAt: new Date().toISOString(),
		correctness: { status: 'passed', command: 'npm run test:e2e' },
		publishable: unreviewed.length === 0,
		environment: ssrEnvironmentMetadata(runtimes),
		harness: {
			sampleCount,
			warmupCount,
			startupSampleCount,
			concurrency,
			concurrencyWaves,
			capacityPrimeConcurrency,
			capacityPrimeMs,
			saturationConcurrency,
			saturationWindows,
			saturationWindowMs,
			serviceProbeRequests,
			measurementRound,
			executionOrder,
			equalPayloadBytes,
			attributionConcurrency,
			attributionWindows,
			attributionWindowMs,
			payloadSweepBytes,
			retentionBatches,
			retentionBatchSize,
			percentiles: ['p50', 'p75', 'p95', 'p99'],
			workingTreeDirty: gitStatusDirty()
		},
		artifacts,
		serviceProbes,
		runtimes: results,
		limitations: [
			'Latency uses warm keep-alive requests over unthrottled local loopback.',
			'Every SSR route loads the same fixture through the controlled service before rendering.',
			'Saturation levels use sustained closed-loop local windows rather than an external open-loop load generator.',
			'Render-only and equal-payload lanes are attribution diagnostics and do not replace end-to-end framework results.',
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
			if (worker) await stopSsrWorker(worker);
			worker = await startSsrWorker({
				runtime,
				participantId,
				transport,
				workerPath,
				workingDirectory: suiteRoot,
				serviceUrl: service.url
			});
			startupMs.push(worker.startupMs);
		}
		for (let index = 0; index < warmupCount; index += 1) await measureSsrRequest(worker.url);

		await control(worker, 'reset');
		const sequentialBefore = await telemetry(worker);
		const sequentialSamples = [];
		for (let index = 0; index < sampleCount; index += 1)
			sequentialSamples.push(await measureSsrRequest(worker.url));
		const sequentialAfter = await telemetry(worker);
		validateResponses(participantId, sequentialSamples);
		const capacityPrime = await runSustainedSsrWindow(
			worker.url,
			capacityPrimeConcurrency,
			capacityPrimeMs
		);
		validateResponses(participantId, capacityPrime.samples);

		const concurrent = await measureConcurrentLane(
			worker,
			participantId,
			concurrency,
			concurrencyWaves
		);
		const saturation = {};
		for (const level of saturationConcurrency)
			saturation[level] = await measureSustainedLane(worker, participantId, level);

		await control(worker, 'reset');
		const retention = [{ requests: 0, memory: (await snapshot(worker)).memory }];
		for (let batch = 1; batch <= retentionBatches; batch += 1) {
			await runConcurrentSsrRequests(worker.url, retentionBatchSize, 1);
			retention.push({
				requests: batch * retentionBatchSize,
				memory: (await snapshot(worker)).memory
			});
		}

		const preloadedSaturation =
			participantId === 'exact' || participantId === 'react'
				? await measurePreloadedLanes(worker, participantId)
				: { supported: false, reason: 'participant-renderer-not-exposed' };
		const servicePhaseSaturation =
			participantId === 'exact' || participantId === 'react'
				? await measureServicePhaseLanes(worker, participantId)
				: { supported: false, reason: 'participant-renderer-not-exposed' };
		const renderOnly =
			participantId === 'exact' || participantId === 'react'
				? await control(
						worker,
						'render-only?iterations=1000&cpuIterations=1000&profileIterations=100'
					)
				: { supported: false, reason: 'participant-renderer-not-exposed' };
		const equalPayload = await measureEqualPayloadLanes(worker, participantId);
		const payloadSweep = await measurePayloadSweep(worker);
		const responseBreakdown =
			participantId === 'exact' || participantId === 'react'
				? await control(worker, 'response-breakdown')
				: { supported: false, reason: 'participant-renderer-not-exposed' };

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
			diagnostics: {
				preloadedSaturation,
				servicePhaseSaturation,
				renderOnly,
				responseBreakdown,
				equalPayload,
				payloadSweep
			},
			response: responseIdentity(sequentialSamples)
		};
	} finally {
		if (worker) await stopSsrWorker(worker);
		resetSsrClientConnections();
	}
}

/** Measures service fetch and decode attribution without instrumenting primary requests. */
async function measureServicePhaseLanes(worker, participantId) {
	const url = `${worker.url}?__benchmarkServicePhases=true`;
	const saturation = {};
	for (const level of attributionConcurrency)
		saturation[level] = await measureSustainedLane(worker, participantId, level, {
			windows: attributionWindows,
			durationMs: attributionWindowMs,
			url
		});
	return { supported: true, saturation };
}

/** Measures renderer and response delivery with one cached immutable service snapshot. */
async function measurePreloadedLanes(worker, participantId) {
	const url = `${worker.url}?__benchmarkPreloaded=true`;
	const prime = await measureSsrRequest(url);
	validateResponses(participantId, [prime]);
	const saturation = {};
	for (const level of attributionConcurrency)
		saturation[level] = await measureSustainedLane(worker, participantId, level, {
			windows: attributionWindows,
			durationMs: attributionWindowMs,
			url
		});
	return { supported: true, saturation };
}

/** Measures one bounded concurrency level with independent CPU and scheduler telemetry. */
async function measureConcurrentLane(worker, participantId, level, waves) {
	await control(worker, 'reset');
	const before = await telemetry(worker);
	const samples = [];
	const throughput = [];
	for (let wave = 0; wave < waves; wave += 1) {
		const startedAt = performance.now();
		const waveSamples = await runConcurrentSsrRequests(worker.url, level, level);
		throughput.push((waveSamples.length / (performance.now() - startedAt)) * 1_000);
		samples.push(...waveSamples);
	}
	const after = await telemetry(worker);
	validateResponses(participantId, samples);
	return {
		concurrency: level,
		waves,
		requests: samples.length,
		samples,
		throughputSamples: throughput,
		client: summarizeClientSamples(samples),
		workerSamples: after.statistics,
		worker: summarizeWorkerRequests(after.statistics),
		requestsPerSecond: summarizeSsrSamples(throughput),
		cpuPerRequest: cpuMillisecondsPerRequest(before.cpu, after.cpu, samples.length),
		eventLoopDelayMs: after.eventLoopDelayMs,
		garbageCollection: after.garbageCollection
	};
}

/** Measures a sustained closed-loop saturation population at one client concurrency. */
async function measureSustainedLane(worker, participantId, level, options = {}) {
	await control(worker, 'reset');
	const before = await telemetry(worker);
	const samples = [];
	const throughput = [];
	const windows = [];
	const count = options.windows ?? saturationWindows;
	const durationMs = options.durationMs ?? saturationWindowMs;
	const url = options.url ?? worker.url;
	for (let window = 0; window < count; window++) {
		const result = await runSustainedSsrWindow(url, level, durationMs);
		throughput.push(result.requestsPerSecond);
		samples.push(...result.samples);
		windows.push({ requests: result.samples.length, elapsedMs: result.elapsedMs });
	}
	if (options.validate !== false) validateResponses(participantId, samples);
	const after = await telemetry(worker);
	const workerSummary = summarizeWorkerRequests(after.statistics);
	return {
		mode: 'sustained-closed-loop',
		concurrency: level,
		windowCount: count,
		windowTargetMs: durationMs,
		windows,
		requests: samples.length,
		observations: {
			client: samples.length,
			worker: after.statistics.firstByteMs.length,
			workerCpuBatches: Math.ceil(after.statistics.userCpuMs.length / 5),
			participantWork: after.statistics.participantWorkMs.length
		},
		throughputSamples: throughput,
		client: summarizeClientSamples(samples),
		worker: workerSummary,
		requestsPerSecond: summarizeSsrSamples(throughput),
		cpuPerRequest: cpuMillisecondsPerRequest(before.cpu, after.cpu, samples.length),
		eventLoopDelayMs: after.eventLoopDelayMs,
		garbageCollection: after.garbageCollection
	};
}

/** Equalizes complete response bytes while preserving each framework's ordinary render path. */
async function measureEqualPayloadLanes(worker, participantId) {
	const result = {};
	for (const level of attributionConcurrency)
		result[level] = await measureSustainedLane(worker, participantId, level, {
			windows: attributionWindows,
			durationMs: attributionWindowMs,
			url: `${worker.url}?__benchmarkPayloadBytes=${equalPayloadBytes}`
		});
	return { targetBytes: equalPayloadBytes, saturation: result };
}

/** Measures transport-only response-size sensitivity without invoking participant renderers. */
async function measurePayloadSweep(worker) {
	const result = {};
	for (const bytes of payloadSweepBytes) {
		const throughput = [];
		const samples = [];
		for (let window = 0; window < attributionWindows; window++) {
			const measured = await runSustainedSsrWindow(
				`${worker.controlUrl}/payload/${bytes}`,
				32,
				attributionWindowMs
			);
			throughput.push(measured.requestsPerSecond);
			samples.push(...measured.samples);
		}
		result[bytes] = {
			concurrency: 32,
			requests: samples.length,
			observations: { client: samples.length },
			client: summarizeClientSamples(samples),
			requestsPerSecond: summarizeSsrSamples(throughput),
			throughputSamples: throughput
		};
	}
	return result;
}

function summarizeLane(samples, before, after, requests) {
	return {
		requests,
		samples,
		client: summarizeClientSamples(samples),
		workerSamples: after.statistics,
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

async function snapshot(worker) {
	return control(worker, 'snapshot');
}

async function telemetry(worker) {
	return control(worker, 'telemetry');
}

async function control(worker, operation) {
	return controlSsrWorker(worker, operation);
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

function nonNegativeInteger(value, fallback) {
	const parsed = value === undefined ? fallback : Number(value);
	if (!Number.isInteger(parsed) || parsed < 0)
		throw new TypeError(`Expected a non-negative integer benchmark option, received ${value}`);
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
