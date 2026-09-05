import { samplePopulation } from './framework-comparison-adapter-support.mjs';

/**
 * Retains fixed raw samples when available and otherwise publishes exact percentile summaries with
 * participant-specific observation counts.
 */
export function requestDistributionPopulation(name, metrics, counts, rawSamples, rawSummaries) {
	if (rawSamples.length === counts.length && counts.every((count) => count === counts[0]))
		return samplePopulation(name, metrics, counts[0], 0, rawSamples);
	return {
		name,
		kind: 'reported',
		metrics,
		rawSummaries:
			rawSamples.length === counts.length
				? rawSamples.map((entry, index) => ({
						name: entry.name,
						observationCount: counts[index],
						metrics: Object.fromEntries(
							metrics.map((metric) => [metric, summarizeRaw(entry.samples, metric)])
						)
					}))
				: rawSummaries
	};
}

function summarizeRaw(samples, metric) {
	const values = samples.map((sample) => sample[metric]).sort((left, right) => left - right);
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
