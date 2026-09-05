import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { startComparisonServer } from './server.mjs';
import {
	parseSsrConcurrencyLevels,
	retainedBytesPerRequest,
	summarizeSsrSamples
} from './ssr-benchmark-statistics.mjs';
import { ssrTransportFor } from './ssr-benchmark-transport.mjs';
import {
	measureSsrRequest,
	resetSsrClientConnections,
	runConcurrentSsrRequests
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
import { settleSsrWorkerInventoryStartup } from './ssr-worker-inventory.mjs';
import { measureInterleavedSsrParticipants } from './ssr-interleaved-measurement.mjs';
import { ssrTimedCheckpointPath, writeSsrEvidence } from './ssr-run-evidence.mjs';

if (!process.argv.includes('--correctness-passed'))
	throw new Error('Run `npm run measure:ssr` so correctness gates the SSR benchmark.');

const suiteRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(suiteRoot, '..');
const workerPath = resolve(import.meta.dirname, 'ssr-benchmark-worker.mjs');
const sampleCount = positiveInteger(process.env.COMPARISON_SSR_SAMPLES, 50);
const warmupCount = positiveInteger(process.env.COMPARISON_SSR_WARMUPS, 10);
const startupSampleCount = positiveInteger(process.env.COMPARISON_SSR_STARTUP_SAMPLES, 5);
const concurrency = positiveInteger(process.env.COMPARISON_SSR_CONCURRENCY, 16);
const concurrencyWaves = positiveInteger(process.env.COMPARISON_SSR_CONCURRENCY_WAVES, 50);
const capacityPrimeConcurrency = positiveInteger(
	process.env.COMPARISON_SSR_CAPACITY_PRIME_CONCURRENCY,
	32
);
const capacityPrimeMs = positiveInteger(process.env.COMPARISON_SSR_CAPACITY_PRIME_MS, 2_000);
const saturationConcurrency = parseSsrConcurrencyLevels(
	process.env.COMPARISON_SSR_SATURATION_CONCURRENCY
);
const saturationWindows = positiveInteger(process.env.COMPARISON_SSR_SATURATION_WINDOWS, 50);
const saturationWindowMs = positiveInteger(process.env.COMPARISON_SSR_SATURATION_WINDOW_MS, 100);
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
const attributionWindows = positiveInteger(process.env.COMPARISON_SSR_ATTRIBUTION_WINDOWS, 50);
const attributionWindowMs = positiveInteger(process.env.COMPARISON_SSR_ATTRIBUTION_WINDOW_MS, 100);
const payloadSweepBytes = [2_048, 3_072, 3_384, 4_096, 5_120, 6_046, 8_192];
const exactBeforeArtifacts = {
	node: optionalPath(process.env.COMPARISON_EXACT_BEFORE_NODE_ARTIFACT),
	bun: optionalPath(process.env.COMPARISON_EXACT_BEFORE_BUN_ARTIFACT)
};
const retentionBatches = positiveInteger(process.env.COMPARISON_SSR_RETENTION_BATCHES, 5);
const retentionBatchSize = positiveInteger(process.env.COMPARISON_SSR_RETENTION_BATCH_SIZE, 50);
const participants = [
	{ id: 'exact', artifacts: { node: 'dist-server', bun: 'dist-bun-server' } },
	{ id: 'react', artifacts: { node: 'dist-server', bun: 'dist-server' } },
	{ id: 'sveltekit', artifacts: { node: 'build/server', bun: 'build/server' } },
	{ id: 'nuxt', artifacts: { node: '.output/server', bun: '.output/server' } },
	{ id: 'tanstack-start', artifacts: { node: '.output/server', bun: '.output/server' } }
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
const output = outputPath();
const timedCheckpoint = ssrTimedCheckpointPath(output);
const createdAt = new Date().toISOString();
const workingTreeDirtyAtStart = gitStatusDirty();
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
	const historicalArtifacts = Object.fromEntries(
		await Promise.all(
			Object.entries(exactBeforeArtifacts)
				.filter(([, artifact]) => artifact)
				.map(async ([runtimeId, artifact]) => [
					runtimeId,
					await measureHistoricalArtifact(artifact)
				])
		)
	);
	const results = {};
	const executionOrder = {};
	const interleaved = {};
	const serviceProbes = {};
	const createReport = (complete) => ({
		schemaVersion: 6,
		kind: 'framework-comparison-ssr-run',
		createdAt,
		complete,
		correctness: { status: 'passed', command: 'npm run test:e2e' },
		publishable: true,
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
			workingTreeDirty: workingTreeDirtyAtStart
		},
		artifacts,
		historicalArtifacts,
		serviceProbes,
		runtimes: results,
		interleaved,
		limitations: [
			'Latency uses warm keep-alive requests over unthrottled local loopback.',
			'Every SSR route loads the same fixture through the controlled service before rendering.',
			'Saturation levels use sustained closed-loop local windows rather than an external open-loop load generator.',
			'Render-only and equal-payload lanes are attribution diagnostics and do not replace end-to-end framework results.',
			'Post-GC slopes are leak signals across a bounded run, not proof of unbounded retention.',
			'Each participant declares its production transport per runtime; transport identity is recorded with every result.',
			'Comparable SSR timing windows use concurrently started, simultaneously warm isolated workers in balanced round-interleaved order; startup, retention, and intrusive profiles remain isolated diagnostics.',
			"Frameworks without native Bun hosting remain on Bun's node:http compatibility layer."
		]
	});
	for (const [runtimeIndex, runtime] of runtimes.entries()) {
		results[runtime.id] = {};
		serviceProbes[runtime.id] = {};
		const runtimeParticipants = balancedParticipantOrder(
			participants,
			measurementRound,
			runtimeIndex + 1
		);
		executionOrder[runtime.id] = runtimeParticipants.map((participant) => participant.id);
		for (const participant of runtimeParticipants)
			serviceProbes[runtime.id][participant.id] = await probeControlledService(
				service.url,
				serviceProbeRequests
			);
		const interleavedRuntime = await measureRuntimeInterleaved(
			runtime,
			runtimeParticipants,
			runtimeIndex
		);
		for (const participant of runtimeParticipants) {
			const transport = ssrTransportFor(participantMetadataById[participant.id], runtime.id);
			process.stdout.write(
				`Profiling ${participant.id} isolated SSR diagnostics on ${runtime.id} through ${transport}...\n`
			);
			results[runtime.id][participant.id] = await measureParticipant(
				runtime,
				participant.id,
				transport
			);
		}
		applyInterleavedResults(results[runtime.id], interleavedRuntime.participants);
		interleaved[runtime.id] = {
			measurementTopology: interleavedRuntime.measurementTopology,
			participantOrder: interleavedRuntime.participantOrder,
			orders: interleavedRuntime.orders,
			...(interleavedRuntime.participants.exactBefore
				? { exactBefore: interleavedRuntime.participants.exactBefore }
				: {})
		};
		await writeSsrEvidence(timedCheckpoint, createReport(false));
		process.stdout.write(
			`Timed SSR checkpoint written after ${runtime.id} to ${relative(repositoryRoot, timedCheckpoint)}\n`
		);
	}
	const report = createReport(true);
	await writeSsrEvidence(output, report);
	printSummary(report);
	process.stdout.write(`SSR comparison written to ${relative(repositoryRoot, output)}\n`);
} finally {
	await service.close();
}

/** Starts one warm worker per comparison lane and transfers its interleaved timing populations. */
async function measureRuntimeInterleaved(runtime, runtimeParticipants, runtimeIndex) {
	const entries = runtimeParticipants.map((participant) => ({
		key: participant.id,
		participantId: participant.id,
		transport: ssrTransportFor(participantMetadataById[participant.id], runtime.id),
		supportsRendererDiagnostics: participant.id === 'exact' || participant.id === 'react'
	}));
	const exactBeforeArtifact = exactBeforeArtifacts[runtime.id];
	if (exactBeforeArtifact)
		entries.push({
			key: 'exactBefore',
			participantId: 'exact',
			transport: ssrTransportFor(participantMetadataById.exact, runtime.id),
			supportsRendererDiagnostics: true,
			serverEntry: exactBeforeArtifact
		});
	const started = [];
	try {
		const startup = await settleSsrWorkerInventoryStartup(
			balancedParticipantOrder(entries, measurementRound, runtimeIndex + 1),
			(entry) =>
				startSsrWorker({
					runtime,
					participantId: entry.participantId,
					transport: entry.transport,
					workerPath,
					workingDirectory: suiteRoot,
					serviceUrl: service.url,
					environment: entry.serverEntry ? { COMPARISON_EXACT_SERVER_ENTRY: entry.serverEntry } : {}
				})
		);
		started.push(...startup.workers);
		if (startup.failure) throw startup.failure;
		return await measureInterleavedSsrParticipants(entries, {
			warmupCount,
			sampleCount,
			concurrency,
			concurrencyWaves,
			capacityPrimeConcurrency,
			capacityPrimeMs,
			saturationConcurrency,
			saturationWindows,
			saturationWindowMs,
			attributionConcurrency,
			attributionWindows,
			attributionWindowMs,
			equalPayloadBytes,
			payloadSweepBytes,
			orderOffset: measurementRound + runtimeIndex
		});
	} finally {
		for (const worker of started) await stopSsrWorker(worker);
		resetSsrClientConnections();
	}
}

/** Replaces sequentially captured comparison lanes while preserving isolated diagnostics. */
function applyInterleavedResults(runtimeResults, participants) {
	for (const [participantId, measured] of Object.entries(participants)) {
		if (participantId === 'exactBefore') continue;
		const target = runtimeResults[participantId];
		target.sequential = measured.sequential;
		target.concurrent = measured.concurrent;
		target.saturation = measured.saturation;
		target.diagnostics.preloadedSaturation = measured.preloadedSaturation;
		target.diagnostics.servicePhaseSaturation = measured.servicePhaseSaturation;
		target.diagnostics.equalPayload = measured.equalPayload;
		target.diagnostics.payloadSweep = measured.payloadSweep;
	}
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
		const responseSample = await measureSsrRequest(worker.url);
		validateResponses(participantId, [responseSample]);

		await control(worker, 'reset');
		const retention = [{ requests: 0, memory: (await snapshot(worker)).memory }];
		for (let batch = 1; batch <= retentionBatches; batch += 1) {
			await runConcurrentSsrRequests(worker.url, retentionBatchSize, 1);
			retention.push({
				requests: batch * retentionBatchSize,
				memory: (await snapshot(worker)).memory
			});
		}

		const renderOnly =
			participantId === 'exact' || participantId === 'react'
				? await control(
						worker,
						'render-only?iterations=1000&cpuIterations=1000&profileIterations=100'
					)
				: { supported: false, reason: 'participant-renderer-not-exposed' };
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
			retention: summarizeRetention(retention),
			diagnostics: {
				renderOnly,
				responseBreakdown
			},
			response: responseIdentity([responseSample])
		};
	} finally {
		if (worker) await stopSsrWorker(worker);
		resetSsrClientConnections();
	}
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

function optionalPath(value) {
	return typeof value === 'string' && value.length > 0 ? resolve(value) : undefined;
}

async function measureHistoricalArtifact(path) {
	const bytes = await readFile(path);
	return {
		kind: 'server-entry-file',
		path: relative(repositoryRoot, path),
		rawBytes: bytes.length,
		sha256: createHash('sha256').update(bytes).digest('hex')
	};
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
				`${runtimeId}/${participantId}: warm total p50=${format(result.sequential.client.totalMs.p50)}ms p95=${format(result.sequential.client.totalMs.p95)}ms, concurrent p50=${format(result.concurrent.client.totalMs.p50)}ms, concurrent p50=${format(result.concurrent.requestsPerSecond.p50)} rps, heap slope=${format(result.retention.bytesPerRequest.heapUsed)} B/request\n`
			);
		}
	}
}

function format(value) {
	return Number.isFinite(value) ? Number(value).toFixed(2) : 'n/a';
}
