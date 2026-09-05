import { repeated, samplePopulation, withUnit } from './framework-comparison-adapter-support.mjs';
import { requestDistributionPopulation } from './framework-comparison-reported-population.mjs';

/** Adapts transport-size and renderer-only SSR attribution diagnostics. */
export function createSsrDiagnosticSuites(raw, runtime, entries) {
	const suites = [];
	const payloadSizes = Object.keys(Object.values(entries)[0]?.diagnostics?.payloadSweep ?? {}).sort(
		(left, right) => Number(left) - Number(right)
	);
	for (const bytes of payloadSizes)
		suites.push(createPayloadSweepSuite(raw, runtime, bytes, entries));
	const renderOnlyEntries = Object.fromEntries(
		Object.entries(entries).filter(([, entry]) => entry.diagnostics?.renderOnly?.supported)
	);
	if (Object.keys(renderOnlyEntries).length > 1)
		suites.push(createRenderOnlySuite(raw, runtime, renderOnlyEntries));
	return suites;
}

function createPayloadSweepSuite(raw, runtime, bytes, entries) {
	const participants = [];
	const clientRaw = [];
	const clientReported = [];
	const throughputRaw = [];
	const clientCounts = [];
	let throughputCount;
	for (const [name, entry] of Object.entries(entries)) {
		const lane = entry.diagnostics.payloadSweep[bytes];
		if (!lane?.client || !lane.throughputSamples?.length)
			throw new Error(`${runtime} payload sweep ${bytes} ${name} omitted summaries`);
		participants.push({
			name,
			metrics: {
				clientTtfbMs: withUnit(lane.client.ttfbMs, 'ms'),
				clientTotalMs: withUnit(lane.client.totalMs, 'ms'),
				responseBytes: withUnit(lane.client.responseBytes, 'bytes'),
				requestsPerSecond: withUnit(lane.requestsPerSecond, 'requests/second')
			}
		});
		const clientCount = lane.observations?.client ?? lane.samples?.length;
		if (!Number.isSafeInteger(clientCount) || clientCount <= 0)
			throw new Error(`${runtime} payload sweep ${bytes} ${name} omitted observation count`);
		clientCounts.push(clientCount);
		if (lane.samples)
			clientRaw.push({
				name,
				samples: lane.samples.map((sample) => ({
					clientTtfbMs: sample.ttfbMs,
					clientTotalMs: sample.totalMs,
					responseBytes: sample.bytes
				}))
			});
		clientReported.push({
			name,
			observationCount: clientCount,
			metrics: {
				clientTtfbMs: lane.client.ttfbMs,
				clientTotalMs: lane.client.totalMs,
				responseBytes: lane.client.responseBytes
			}
		});
		throughputCount ??= lane.throughputSamples.length;
		if (lane.throughputSamples.length !== throughputCount)
			throw new Error(`${runtime} payload sweep ${bytes} changed its window population`);
		throughputRaw.push({
			name,
			samples: lane.throughputSamples.map((requestsPerSecond) => ({ requestsPerSecond }))
		});
	}
	return {
		table: { suite: `framework-comparison-ssr-${runtime}-payload-${bytes}`, participants },
		populations: [
			requestDistributionPopulation(
				'transport requests',
				['clientTtfbMs', 'clientTotalMs', 'responseBytes'],
				clientCounts,
				clientRaw,
				clientReported
			),
			samplePopulation(
				'throughput windows',
				['requestsPerSecond'],
				throughputCount,
				0,
				throughputRaw
			)
		],
		artifactHashes: artifactHashes(raw, runtime, entries),
		responseIdentity: {
			status: 'inapplicable',
			reason: 'transport-only payload controls intentionally omit framework markup'
		}
	};
}

function createRenderOnlySuite(raw, runtime, entries) {
	const participants = [];
	const timingRaw = [];
	const aggregateRaw = [];
	let timingCount;
	for (const [name, entry] of Object.entries(entries)) {
		const diagnostic = entry.diagnostics.renderOnly;
		const samples = diagnostic.timing.samplesMs;
		timingCount ??= samples.length;
		if (samples.length !== timingCount)
			throw new Error(`${runtime} render-only changed its timing population`);
		participants.push({
			name,
			metrics: {
				renderOnlyMs: { unit: 'ms', ...summarizeValues(samples) },
				responseBytes: repeated(diagnostic.timing.responseBytes, 'bytes')
			}
		});
		timingRaw.push({ name, samples: samples.map((renderOnlyMs) => ({ renderOnlyMs })) });
		aggregateRaw.push({ name, samples: [{ responseBytes: diagnostic.timing.responseBytes }] });
	}
	return {
		table: { suite: `framework-comparison-ssr-${runtime}-render-only`, participants },
		populations: [
			samplePopulation('renderer calls', ['renderOnlyMs'], timingCount, 0, timingRaw),
			samplePopulation('renderer response', ['responseBytes'], 1, 0, aggregateRaw)
		],
		artifactHashes: artifactHashes(raw, runtime, entries),
		responseIdentity: {
			status: 'inapplicable',
			reason: 'render-only diagnostics intentionally compare framework-owned envelopes'
		}
	};
}

function artifactHashes(raw, runtime, entries) {
	return Object.fromEntries(
		Object.keys(entries).map((name) => [name, raw.artifacts?.[runtime]?.[name]?.hash])
	);
}

function summarizeValues(rawValues) {
	const values = [...rawValues].sort((left, right) => left - right);
	return {
		mean: values.reduce((sum, value) => sum + value, 0) / values.length,
		...Object.fromEntries(
			[
				['p50', 0.5],
				['p75', 0.75],
				['p95', 0.95],
				['p99', 0.99]
			].map(([name, quantile]) => [
				name,
				values[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)]
			])
		)
	};
}
