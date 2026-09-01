import { performance } from 'node:perf_hooks';

import {
	measureSsrRequest,
	runConcurrentSsrRequests,
	runSustainedSsrWindow
} from './ssr-benchmark-client.mjs';
import {
	cpuMillisecondsPerRequest,
	summarizeSsrSamples,
	summarizeWorkerRequests
} from './ssr-benchmark-statistics.mjs';
import { controlSsrWorker } from './ssr-worker-controller.mjs';
import { balancedRoundOrder } from './balanced-round-order.mjs';

/**
 * Measures every comparable SSR timing lane in round-interleaved participant order.
 * Workers remain independently owned and warm for the population; telemetry is reset per lane.
 * Intrusive CPU/allocation profiles and retention slopes intentionally remain outside this owner.
 */
export async function measureInterleavedSsrParticipants(entries, config) {
	assertEntries(entries);
	const orders = {};
	await warmParticipants(entries, config.warmupCount, config.orderOffset);
	const sequential = await measureRequestPopulation(entries, {
		count: config.sampleCount,
		orderOffset: config.orderOffset,
		orders,
		orderKey: 'sequential',
		url: (entry) => entry.worker.url
	});
	await primeCapacity(entries, config);
	const concurrent = await measureConcurrentPopulation(entries, {
		level: config.concurrency,
		count: config.concurrencyWaves,
		orderOffset: config.orderOffset + 1,
		orders,
		orderKey: 'concurrent',
		url: (entry) => entry.worker.url
	});
	const saturation = await measureSaturationInventory(entries, {
		levels: config.saturationConcurrency,
		count: config.saturationWindows,
		durationMs: config.saturationWindowMs,
		orderOffset: config.orderOffset + 2,
		orders,
		orderPrefix: 'saturation',
		url: (entry) => entry.worker.url
	});
	const preloadedEntries = entries.filter((entry) => entry.supportsRendererDiagnostics);
	const preloadedSaturation = await measurePreparedInventory(preloadedEntries, {
		levels: config.attributionConcurrency,
		count: config.attributionWindows,
		durationMs: config.attributionWindowMs,
		orderOffset: config.orderOffset + 3,
		orders,
		orderPrefix: 'preloaded',
		url: (entry) => `${entry.worker.url}?__benchmarkPreloaded=true`,
		prime: true
	});
	const servicePhaseSaturation = await measurePreparedInventory(preloadedEntries, {
		levels: config.attributionConcurrency,
		count: config.attributionWindows,
		durationMs: config.attributionWindowMs,
		orderOffset: config.orderOffset + 4,
		orders,
		orderPrefix: 'service-phase',
		url: (entry) => `${entry.worker.url}?__benchmarkServicePhases=true`
	});
	const equalPayload = await measurePreparedInventory(entries, {
		levels: config.attributionConcurrency,
		count: config.attributionWindows,
		durationMs: config.attributionWindowMs,
		orderOffset: config.orderOffset + 5,
		orders,
		orderPrefix: 'equal-payload',
		url: (entry) => `${entry.worker.url}?__benchmarkPayloadBytes=${config.equalPayloadBytes}`
	});
	const payloadSweep = await measurePayloadSweep(entries, config, orders);
	return {
		measurementTopology: 'balanced-round-interleaved',
		participantOrder: entries.map((entry) => entry.key),
		orders,
		participants: Object.fromEntries(
			entries.map((entry) => {
				const rendererIndex = preloadedEntries.findIndex(
					(candidate) => candidate.key === entry.key
				);
				return [
					entry.key,
					{
						sequential: sequential[entry.key],
						concurrent: concurrent[entry.key],
						saturation: saturation[entry.key],
						preloadedSaturation:
							rendererIndex < 0
								? { supported: false, reason: 'participant-renderer-not-exposed' }
								: {
										supported: true,
										saturation: preloadedSaturation[entry.key]
									},
						servicePhaseSaturation:
							rendererIndex < 0
								? { supported: false, reason: 'participant-renderer-not-exposed' }
								: {
										supported: true,
										saturation: servicePhaseSaturation[entry.key]
									},
						equalPayload: {
							targetBytes: config.equalPayloadBytes,
							saturation: equalPayload[entry.key]
						},
						payloadSweep: payloadSweep[entry.key]
					}
				];
			})
		)
	};
}

async function primeCapacity(entries, config) {
	for (const entry of balancedRoundOrder(entries, 0, config.orderOffset + 1)) {
		const measured = await runSustainedSsrWindow(
			entry.worker.url,
			config.capacityPrimeConcurrency,
			config.capacityPrimeMs
		);
		validateResponses(entry, measured.samples);
	}
}

async function warmParticipants(entries, count, offset) {
	for (let round = 0; round < count; round++)
		for (const entry of balancedRoundOrder(entries, round, offset))
			await measureSsrRequest(entry.worker.url);
}

async function measureRequestPopulation(entries, options) {
	const state = await beginLane(entries);
	for (let round = 0; round < options.count; round++) {
		const order = balancedRoundOrder(entries, round, options.orderOffset);
		recordOrder(options, order);
		for (const entry of order)
			state.get(entry.key).samples.push(await measureSsrRequest(options.url(entry)));
	}
	return finishRequestLane(entries, state);
}

async function measureConcurrentPopulation(entries, options) {
	const state = await beginLane(entries);
	for (let round = 0; round < options.count; round++) {
		const order = balancedRoundOrder(entries, round, options.orderOffset);
		recordOrder(options, order);
		for (const entry of order) {
			const startedAt = performance.now();
			const samples = await runConcurrentSsrRequests(
				options.url(entry),
				options.level,
				options.level
			);
			const participant = state.get(entry.key);
			participant.samples.push(...samples);
			participant.throughput.push((samples.length / (performance.now() - startedAt)) * 1_000);
		}
	}
	return finishConcurrentLane(entries, state, options.level, options.count);
}

async function measureSaturationInventory(entries, options) {
	const result = Object.fromEntries(entries.map((entry) => [entry.key, {}]));
	for (const [levelIndex, level] of options.levels.entries()) {
		const lane = await measureSustainedPopulation(entries, {
			...options,
			level,
			orderOffset: options.orderOffset + levelIndex,
			orderKey: `${options.orderPrefix}-${level}`
		});
		for (const entry of entries) result[entry.key][level] = lane[entry.key];
	}
	return result;
}

async function measurePreparedInventory(entries, options) {
	if (entries.length === 0) return {};
	if (options.prime) for (const entry of entries) await measureSsrRequest(options.url(entry));
	return measureSaturationInventory(entries, options);
}

async function measureSustainedPopulation(entries, options) {
	const state = await beginLane(entries);
	for (let round = 0; round < options.count; round++) {
		const order = balancedRoundOrder(entries, round, options.orderOffset);
		recordOrder(options, order);
		for (const entry of order) {
			const measured = await runSustainedSsrWindow(
				options.url(entry),
				options.level,
				options.durationMs
			);
			const participant = state.get(entry.key);
			participant.samples.push(...measured.samples);
			participant.throughput.push(measured.requestsPerSecond);
			participant.windows.push({
				requests: measured.samples.length,
				elapsedMs: measured.elapsedMs
			});
		}
	}
	return finishSustainedLane(entries, state, options);
}

async function measurePayloadSweep(entries, config, orders) {
	const result = Object.fromEntries(entries.map((entry) => [entry.key, {}]));
	for (const [payloadIndex, bytes] of config.payloadSweepBytes.entries()) {
		const state = Object.fromEntries(
			entries.map((entry) => [entry.key, { samples: [], throughput: [] }])
		);
		const orderKey = `payload-${bytes}`;
		for (let round = 0; round < config.attributionWindows; round++) {
			const order = balancedRoundOrder(entries, round, config.orderOffset + 6 + payloadIndex);
			orders[orderKey] ??= [];
			orders[orderKey].push(order.map((entry) => entry.key));
			for (const entry of order) {
				const measured = await runSustainedSsrWindow(
					`${entry.worker.controlUrl}/payload/${bytes}`,
					32,
					config.attributionWindowMs
				);
				state[entry.key].samples.push(...measured.samples);
				state[entry.key].throughput.push(measured.requestsPerSecond);
			}
		}
		for (const entry of entries) {
			const participant = state[entry.key];
			result[entry.key][bytes] = {
				concurrency: 32,
				requests: participant.samples.length,
				observations: { client: participant.samples.length },
				client: summarizeClientSamples(participant.samples),
				requestsPerSecond: summarizeSsrSamples(participant.throughput),
				throughputSamples: participant.throughput
			};
		}
	}
	return result;
}

async function beginLane(entries) {
	const state = new Map();
	for (const entry of entries) {
		await controlSsrWorker(entry.worker, 'reset');
		state.set(entry.key, {
			before: await controlSsrWorker(entry.worker, 'telemetry'),
			samples: [],
			throughput: [],
			windows: []
		});
	}
	return state;
}

async function finishRequestLane(entries, state) {
	const result = {};
	for (const entry of entries) {
		const participant = state.get(entry.key);
		const after = await controlSsrWorker(entry.worker, 'telemetry');
		validateResponses(entry, participant.samples);
		result[entry.key] = summarizeRequestLane(participant, after);
	}
	return result;
}

async function finishConcurrentLane(entries, state, level, waves) {
	const result = {};
	for (const entry of entries) {
		const participant = state.get(entry.key);
		const after = await controlSsrWorker(entry.worker, 'telemetry');
		validateResponses(entry, participant.samples);
		result[entry.key] = {
			concurrency: level,
			waves,
			requests: participant.samples.length,
			samples: participant.samples,
			throughputSamples: participant.throughput,
			client: summarizeClientSamples(participant.samples),
			workerSamples: after.statistics,
			worker: summarizeWorkerRequests(after.statistics),
			requestsPerSecond: summarizeSsrSamples(participant.throughput),
			cpuPerRequest: cpuMillisecondsPerRequest(
				participant.before.cpu,
				after.cpu,
				participant.samples.length
			),
			eventLoopDelayMs: after.eventLoopDelayMs,
			garbageCollection: after.garbageCollection
		};
	}
	return result;
}

async function finishSustainedLane(entries, state, options) {
	const result = {};
	for (const entry of entries) {
		const participant = state.get(entry.key);
		const after = await controlSsrWorker(entry.worker, 'telemetry');
		validateResponses(entry, participant.samples);
		result[entry.key] = {
			mode: 'sustained-closed-loop',
			concurrency: options.level,
			windowCount: options.count,
			windowTargetMs: options.durationMs,
			windows: participant.windows,
			requests: participant.samples.length,
			observations: {
				client: participant.samples.length,
				worker: after.statistics.firstByteMs.length,
				workerCpuBatches: Math.ceil(after.statistics.userCpuMs.length / 5),
				participantWork: after.statistics.participantWorkMs.length
			},
			throughputSamples: participant.throughput,
			client: summarizeClientSamples(participant.samples),
			worker: summarizeWorkerRequests(after.statistics),
			requestsPerSecond: summarizeSsrSamples(participant.throughput),
			cpuPerRequest: cpuMillisecondsPerRequest(
				participant.before.cpu,
				after.cpu,
				participant.samples.length
			),
			eventLoopDelayMs: after.eventLoopDelayMs,
			garbageCollection: after.garbageCollection
		};
	}
	return result;
}

function summarizeRequestLane(participant, after) {
	return {
		requests: participant.samples.length,
		samples: participant.samples,
		client: summarizeClientSamples(participant.samples),
		workerSamples: after.statistics,
		worker: summarizeWorkerRequests(after.statistics),
		cpuPerRequest: cpuMillisecondsPerRequest(
			participant.before.cpu,
			after.cpu,
			participant.samples.length
		),
		eventLoopDelayMs: after.eventLoopDelayMs,
		garbageCollection: after.garbageCollection,
		memoryBefore: participant.before.memory,
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

function validateResponses(entry, samples) {
	if (samples.length === 0) throw new Error(`${entry.key} interleaved lane returned no responses`);
	if (samples.some((sample) => !sample.meaningful))
		throw new Error(`${entry.key} interleaved lane omitted meaningful SSR content`);
	const identities = new Set(samples.map((sample) => `${sample.bytes}:${sample.hash}`));
	if (identities.size !== 1)
		throw new Error(`${entry.key} interleaved lane returned unstable response bytes`);
}

function recordOrder(options, order) {
	options.orders[options.orderKey] ??= [];
	options.orders[options.orderKey].push(order.map((entry) => entry.key));
}

function assertEntries(entries) {
	if (!Array.isArray(entries) || entries.length < 2)
		throw new TypeError('Interleaved SSR measurement requires at least two participants');
	if (new Set(entries.map((entry) => entry.key)).size !== entries.length)
		throw new TypeError('Interleaved SSR participant keys must be unique');
}
