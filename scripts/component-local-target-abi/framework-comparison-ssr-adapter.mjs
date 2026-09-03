import {
	capitalize,
	createDeterministicSuite,
	repeated,
	samplePopulation,
	validateRaw,
	withSourcePublication,
	withUnit
} from './framework-comparison-adapter-support.mjs';
import { batchedCpuPerRequest } from '../../framework-comparison/src/ssr-benchmark-statistics.mjs';
import { createSsrDiagnosticSuites } from './framework-comparison-ssr-diagnostic-adapter.mjs';
import { createSsrRetentionSuite } from './framework-comparison-ssr-retention-adapter.mjs';
import { createSsrStartupSuite } from './framework-comparison-ssr-startup-adapter.mjs';
import { requestDistributionPopulation } from './framework-comparison-reported-population.mjs';

/** Adapts SSR startup and every request lane while preserving distinct raw populations. */
export function adaptFrameworkComparisonSsr(raw) {
	validateRaw(raw, 'framework-comparison-ssr-run');
	const suites = [];
	for (const [runtime, runtimeEntries] of Object.entries(raw.runtimes)) {
		const entries = orderSsrEntries(runtimeEntries);
		const responseHashes = Object.fromEntries(
			Object.entries(entries).map(([name, entry]) => [name, entry.response?.hash])
		);
		const artifactHashes = Object.fromEntries(
			Object.entries(raw.artifacts?.[runtime] ?? {}).map(([name, artifact]) => [
				name,
				artifact.hash
			])
		);
		suites.push(
			createDeterministicSuite({
				name: `framework-comparison-ssr-${runtime}-artifacts`,
				entries: raw.artifacts?.[runtime],
				values: (artifact) => ({
					artifactRawBytes: artifact.rawBytes,
					artifactGzipBytes: artifact.gzipBytes,
					artifactBrotliBytes: artifact.brotliBytes,
					artifactFiles: artifact.files
				}),
				artifactHashes,
				responseHashes
			})
		);
		suites.push(createSsrStartupSuite(raw, runtime, entries));
		suites.push(
			createSsrRequestSuite(raw, runtime, 'sequential', entries, (entry) => entry.sequential)
		);
		suites.push(
			createSsrRequestSuite(raw, runtime, 'concurrent', entries, (entry) => entry.concurrent)
		);
		const levels = Object.keys(Object.values(entries)[0]?.saturation ?? {}).sort(
			(left, right) => Number(left) - Number(right)
		);
		for (const level of levels) {
			for (const entry of Object.values(entries)) {
				if (!entry.saturation?.[level])
					throw new Error(`${runtime} SSR participant omitted saturation level ${level}`);
			}
			suites.push(
				createSsrRequestSuite(
					raw,
					runtime,
					`saturation-${level}`,
					entries,
					(entry) => entry.saturation[level]
				)
			);
		}
		const preloadedEntries = Object.fromEntries(
			Object.entries(entries).filter(
				([, entry]) => entry.diagnostics?.preloadedSaturation?.supported === true
			)
		);
		const preloadedLevels = Object.keys(
			Object.values(preloadedEntries)[0]?.diagnostics.preloadedSaturation.saturation ?? {}
		).sort((left, right) => Number(left) - Number(right));
		for (const level of preloadedLevels)
			suites.push(
				createSsrRequestSuite(
					raw,
					runtime,
					`preloaded-${level}`,
					preloadedEntries,
					(entry) => entry.diagnostics.preloadedSaturation.saturation[level]
				)
			);
		const attributionLevels = Object.keys(
			Object.values(entries)[0]?.diagnostics?.equalPayload?.saturation ?? {}
		).sort((left, right) => Number(left) - Number(right));
		for (const level of attributionLevels)
			suites.push(
				createSsrRequestSuite(
					raw,
					runtime,
					`equal-payload-${level}`,
					entries,
					(entry) => entry.diagnostics.equalPayload.saturation[level]
				)
			);
		suites.push(...createSsrDiagnosticSuites(raw, runtime, entries));
		suites.push(createSsrRetentionSuite(raw, runtime, entries));
	}
	return Object.freeze(suites.map((suite) => withSourcePublication(suite, raw)));
}

function orderSsrEntries(entries) {
	const rank = new Map(['exact', 'react', 'sveltekit', 'nuxt'].map((name, index) => [name, index]));
	return Object.fromEntries(
		Object.entries(entries).sort(
			([left], [right]) =>
				(rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER)
		)
	);
}

function createSsrRequestSuite(raw, runtime, laneName, entries, selectLane) {
	const participants = [];
	const clientRaw = [];
	const workerRaw = [];
	const workerCpuRaw = [];
	const participantWorkRaw = [];
	const clientReported = [];
	const workerReported = [];
	const workerCpuReported = [];
	const participantWorkReported = [];
	const throughputRaw = [];
	const eventLoopRaw = [];
	const aggregateRaw = [];
	const artifactHashes = {};
	const responseHashes = {};
	const clientCounts = [];
	const workerCounts = [];
	const workerCpuCounts = [];
	const participantWorkCounts = [];
	let throughputCount;
	const memoryFields = ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'];
	const hasMemory = Object.values(entries).every((entry) => {
		const lane = selectLane(entry);
		return lane?.memoryBefore && lane?.memoryAfter;
	});
	const hasParticipantWork = Object.values(entries).every((entry) => {
		const lane = selectLane(entry);
		return (
			lane?.worker?.phases?.participantWorkMs &&
			(lane.observations?.participantWork ?? lane.workerSamples?.participantWorkMs?.length)
		);
	});
	const aggregateMetrics = [
		'processUserCpuPerRequestMs',
		'processSystemCpuPerRequestMs',
		'processTotalCpuPerRequestMs',
		'garbageCollectionCount',
		'garbageCollectionDurationMs'
	];
	if (hasMemory)
		for (const field of memoryFields)
			aggregateMetrics.push(
				`memoryBefore${capitalize(field)}Bytes`,
				`memoryAfter${capitalize(field)}Bytes`
			);
	for (const [participantName, entry] of Object.entries(entries)) {
		const lane = selectLane(entry);
		if (!lane?.client || !lane.worker)
			throw new Error(`${runtime} ${laneName} ${participantName} omitted SSR summaries`);
		const hasRawRequests = Array.isArray(lane.samples) && lane.workerSamples;
		const clientCount = lane.observations?.client ?? lane.samples?.length;
		const workerCount = lane.observations?.worker ?? lane.workerSamples?.firstByteMs?.length;
		const workerCpuCount =
			lane.observations?.workerCpuBatches ??
			(hasRawRequests ? Math.ceil(lane.workerSamples.userCpuMs.length / 5) : undefined);
		if (![clientCount, workerCount, workerCpuCount].every((count) => count > 0))
			throw new Error(`${runtime} ${laneName} ${participantName} omitted SSR observation counts`);
		clientCounts.push(clientCount);
		workerCounts.push(workerCount);
		workerCpuCounts.push(workerCpuCount);
		const workerCpuBatches = hasRawRequests
			? batchedCpuPerRequest(lane.workerSamples, 5)
			: undefined;
		const metrics = requestMetrics(lane);
		if (Array.isArray(lane.throughputSamples)) {
			throughputCount ??= lane.throughputSamples.length;
			if (lane.throughputSamples.length !== throughputCount)
				throw new Error(`${runtime} ${laneName} changed its throughput population`);
			metrics.requestsPerSecond = withUnit(lane.requestsPerSecond, 'requests/second');
			throughputRaw.push({
				name: participantName,
				samples: lane.throughputSamples.map((requestsPerSecond) => ({ requestsPerSecond }))
			});
		}
		if (hasMemory) addMemoryMetrics(metrics, lane, memoryFields);
		participants.push({ name: participantName, metrics });
		if (hasRawRequests) {
			clientRaw.push({
				name: participantName,
				samples: lane.samples.map((sample) => ({
					clientTtfbMs: sample.ttfbMs,
					clientTotalMs: sample.totalMs,
					responseBytes: sample.bytes
				}))
			});
			workerRaw.push({
				name: participantName,
				samples: lane.workerSamples.firstByteMs.map((firstByteMs, index) => ({
					workerFirstByteMs: firstByteMs,
					workerTotalMs: lane.workerSamples.totalMs[index],
					workerDeliveryMs: lane.workerSamples.totalMs[index] - firstByteMs
				}))
			});
			workerCpuRaw.push({
				name: participantName,
				samples: workerCpuBatches.map((sample) => ({
					workerUserCpuPerRequestMs: sample.userMs,
					workerSystemCpuPerRequestMs: sample.systemMs,
					workerTotalCpuPerRequestMs: sample.totalMs
				}))
			});
		}
		clientReported.push(
			reportedEntry(participantName, clientCount, {
				clientTtfbMs: lane.client.ttfbMs,
				clientTotalMs: lane.client.totalMs,
				responseBytes: lane.client.responseBytes
			})
		);
		workerReported.push(
			reportedEntry(participantName, workerCount, {
				workerFirstByteMs: lane.worker.firstByteMs,
				workerTotalMs: lane.worker.totalMs,
				workerDeliveryMs: lane.worker.deliveryMs
			})
		);
		workerCpuReported.push(
			reportedEntry(participantName, workerCpuCount, {
				workerUserCpuPerRequestMs: lane.worker.userCpuPerRequestMs,
				workerSystemCpuPerRequestMs: lane.worker.systemCpuPerRequestMs,
				workerTotalCpuPerRequestMs: lane.worker.totalCpuPerRequestMs
			})
		);
		if (hasParticipantWork) {
			metrics.workerParticipantWorkMs = withUnit(lane.worker.phases.participantWorkMs, 'ms');
			const participantWorkCount =
				lane.observations?.participantWork ?? lane.workerSamples.participantWorkMs.length;
			participantWorkCounts.push(participantWorkCount);
			if (hasRawRequests)
				participantWorkRaw.push({
					name: participantName,
					samples: lane.workerSamples.participantWorkMs.map((workerParticipantWorkMs) => ({
						workerParticipantWorkMs
					}))
				});
			participantWorkReported.push(
				reportedEntry(participantName, participantWorkCount, {
					workerParticipantWorkMs: lane.worker.phases.participantWorkMs
				})
			);
		}
		eventLoopRaw.push({
			name: participantName,
			observationCount: lane.eventLoopDelayMs.count,
			metrics: { eventLoopDelayMs: lane.eventLoopDelayMs }
		});
		aggregateRaw.push({
			name: participantName,
			samples: [aggregateSample(lane, hasMemory ? memoryFields : [])]
		});
		artifactHashes[participantName] = raw.artifacts?.[runtime]?.[participantName]?.hash;
		responseHashes[participantName] = entry.response?.hash;
	}
	const populations = requestPopulations({
		clientCounts,
		workerCounts,
		workerCpuCounts,
		participantWorkCounts,
		throughputCount,
		aggregateMetrics,
		clientRaw,
		clientReported,
		workerRaw,
		workerReported,
		workerCpuRaw,
		workerCpuReported,
		participantWorkRaw,
		participantWorkReported,
		throughputRaw,
		eventLoopRaw,
		aggregateRaw
	});
	return Object.freeze({
		table: { suite: `framework-comparison-ssr-${runtime}-${laneName}`, participants },
		populations,
		artifactHashes,
		responseHashes
	});
}

function requestMetrics(lane) {
	return {
		clientTtfbMs: withUnit(lane.client.ttfbMs, 'ms'),
		clientTotalMs: withUnit(lane.client.totalMs, 'ms'),
		responseBytes: withUnit(lane.client.responseBytes, 'bytes'),
		workerFirstByteMs: withUnit(lane.worker.firstByteMs, 'ms'),
		workerTotalMs: withUnit(lane.worker.totalMs, 'ms'),
		workerDeliveryMs: withUnit(lane.worker.deliveryMs, 'ms'),
		workerUserCpuPerRequestMs: withUnit(lane.worker.userCpuPerRequestMs, 'ms'),
		workerSystemCpuPerRequestMs: withUnit(lane.worker.systemCpuPerRequestMs, 'ms'),
		workerTotalCpuPerRequestMs: withUnit(lane.worker.totalCpuPerRequestMs, 'ms'),
		eventLoopDelayMs: withUnit(lane.eventLoopDelayMs, 'ms'),
		processUserCpuPerRequestMs: repeated(lane.cpuPerRequest.userMs, 'ms'),
		processSystemCpuPerRequestMs: repeated(lane.cpuPerRequest.systemMs, 'ms'),
		processTotalCpuPerRequestMs: repeated(lane.cpuPerRequest.totalMs, 'ms'),
		garbageCollectionCount: repeated(lane.garbageCollection.count, 'count'),
		garbageCollectionDurationMs: repeated(lane.garbageCollection.durationMs, 'ms')
	};
}

function addMemoryMetrics(metrics, lane, fields) {
	for (const field of fields) {
		metrics[`memoryBefore${capitalize(field)}Bytes`] = repeated(lane.memoryBefore[field], 'bytes');
		metrics[`memoryAfter${capitalize(field)}Bytes`] = repeated(lane.memoryAfter[field], 'bytes');
	}
}

function aggregateSample(lane, memoryFields) {
	const sample = {
		processUserCpuPerRequestMs: lane.cpuPerRequest.userMs,
		processSystemCpuPerRequestMs: lane.cpuPerRequest.systemMs,
		processTotalCpuPerRequestMs: lane.cpuPerRequest.totalMs,
		garbageCollectionCount: lane.garbageCollection.count,
		garbageCollectionDurationMs: lane.garbageCollection.durationMs
	};
	for (const field of memoryFields) {
		sample[`memoryBefore${capitalize(field)}Bytes`] = lane.memoryBefore[field];
		sample[`memoryAfter${capitalize(field)}Bytes`] = lane.memoryAfter[field];
	}
	return sample;
}

function requestPopulations(lanes) {
	const populations = [
		requestDistributionPopulation(
			'client requests',
			['clientTtfbMs', 'clientTotalMs', 'responseBytes'],
			lanes.clientCounts,
			lanes.clientRaw,
			lanes.clientReported
		),
		requestDistributionPopulation(
			'worker requests',
			['workerFirstByteMs', 'workerTotalMs', 'workerDeliveryMs'],
			lanes.workerCounts,
			lanes.workerRaw,
			lanes.workerReported
		),
		requestDistributionPopulation(
			'worker CPU batches',
			['workerUserCpuPerRequestMs', 'workerSystemCpuPerRequestMs', 'workerTotalCpuPerRequestMs'],
			lanes.workerCpuCounts,
			lanes.workerCpuRaw,
			lanes.workerCpuReported
		),
		{
			name: 'event-loop histogram',
			kind: 'reported',
			metrics: ['eventLoopDelayMs'],
			rawSummaries: lanes.eventLoopRaw
		},
		samplePopulation('lane aggregates', lanes.aggregateMetrics, 1, 0, lanes.aggregateRaw)
	];
	if (lanes.participantWorkReported.length)
		populations.push(
			requestDistributionPopulation(
				'participant work',
				['workerParticipantWorkMs'],
				lanes.participantWorkCounts,
				lanes.participantWorkRaw,
				lanes.participantWorkReported
			)
		);
	if (lanes.throughputRaw.length)
		populations.push(
			samplePopulation(
				'throughput waves',
				['requestsPerSecond'],
				lanes.throughputCount,
				0,
				lanes.throughputRaw
			)
		);
	return populations;
}

function reportedEntry(name, observationCount, metrics) {
	return { name, observationCount, metrics };
}
