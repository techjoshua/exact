import { summarizePercentiles } from './percentile-summary.mjs';

/** Summarizes the complete percentile contract for one finite SSR sample lane. */
export function summarizeSsrSamples(values) {
	return summarizePercentiles(values);
}

/** Calculates the least-squares retained-byte slope per completed request. */
export function retainedBytesPerRequest(points, readBytes) {
	if (points.length < 2) return null;
	const meanRequests = points.reduce((sum, point) => sum + point.requests, 0) / points.length;
	const meanBytes = points.reduce((sum, point) => sum + readBytes(point), 0) / points.length;
	let numerator = 0;
	let denominator = 0;
	for (const point of points) {
		const requestDelta = point.requests - meanRequests;
		numerator += requestDelta * (readBytes(point) - meanBytes);
		denominator += requestDelta * requestDelta;
	}
	return denominator === 0 ? null : numerator / denominator;
}

/** Converts cumulative process CPU counters into per-request milliseconds. */
export function cpuMillisecondsPerRequest(before, after, requests) {
	if (!Number.isInteger(requests) || requests <= 0)
		throw new TypeError('SSR CPU normalization requires a positive integer request count');
	const userMs = (after.user - before.user) / 1_000 / requests;
	const systemMs = (after.system - before.system) / 1_000 / requests;
	return { userMs, systemMs, totalMs: userMs + systemMs };
}

/** Summarizes worker-observed request phases without changing sample membership. */
export function summarizeWorkerRequests(statistics) {
	const cpuBatches = batchedCpuPerRequest(statistics, 5);
	return {
		firstByteMs: summarizeSsrSamples(statistics.firstByteMs),
		totalMs: summarizeSsrSamples(statistics.totalMs),
		deliveryMs: summarizeSsrSamples(
			statistics.totalMs.map((total, index) => total - statistics.firstByteMs[index])
		),
		cpuBatchSize: 5,
		userCpuPerRequestMs: summarizeSsrSamples(cpuBatches.map((sample) => sample.userMs)),
		systemCpuPerRequestMs: summarizeSsrSamples(cpuBatches.map((sample) => sample.systemMs)),
		totalCpuPerRequestMs: summarizeSsrSamples(cpuBatches.map((sample) => sample.totalMs)),
		phases: summarizeAvailableWorkerPhases(statistics)
	};
}

/** Preserves only worker phase populations actually exposed by a participant integration. */
export function summarizeAvailableWorkerPhases(statistics) {
	return Object.fromEntries(
		[
			'participantWorkMs',
			'dataLoadMs',
			'dataFetchMs',
			'dataDecodeMs',
			'renderMs',
			'envelopeMs',
			'renderedBytes',
			'responseBytes'
		]
			.filter((name) => statistics[name]?.length)
			.map((name) => [name, summarizeSsrSamples(statistics[name])])
	);
}

/** Parses, sorts, and deduplicates the positive concurrency levels selected for a saturation run. */
export function parseSsrConcurrencyLevels(value, fallback = [1, 4, 8, 16, 32, 64]) {
	const source = value === undefined ? fallback : value.split(',').map(Number);
	if (!source.length || source.some((level) => !Number.isInteger(level) || level <= 0))
		throw new TypeError(`SSR concurrency levels must be positive integers, received ${value}`);
	return [...new Set(source)].sort((left, right) => left - right);
}

/** Groups coarse process CPU ticks before normalizing them to one request. */
/** Groups coarse per-request process CPU deltas into stable fixed-size observations. */
export function batchedCpuPerRequest(statistics, batchSize) {
	const result = [];
	for (let start = 0; start < (statistics.userCpuMs?.length ?? 0); start += batchSize) {
		const end = Math.min(start + batchSize, statistics.userCpuMs.length);
		const requests = end - start;
		let userMs = 0;
		let systemMs = 0;
		for (let index = start; index < end; index += 1) {
			userMs += statistics.userCpuMs[index];
			systemMs += statistics.systemCpuMs?.[index] ?? 0;
		}
		result.push({
			userMs: userMs / requests,
			systemMs: systemMs / requests,
			totalMs: (userMs + systemMs) / requests
		});
	}
	return result;
}
