/** Percentiles reported for every sampled comparison metric. */
export const comparisonPercentiles = Object.freeze([
	['p50', 0.5],
	['p75', 0.75],
	['p95', 0.95],
	['p99', 0.99]
]);

/**
 * Summarizes finite measurements with the suite's nearest-rank convention.
 * Missing metrics remain null at every percentile instead of silently changing sample membership.
 */
export function summarizePercentiles(values) {
	const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
	return Object.fromEntries(
		comparisonPercentiles.map(([label, quantile]) => [
			label,
			finite.length
				? finite[Math.min(finite.length - 1, Math.ceil(finite.length * quantile) - 1)]
				: null
		])
	);
}

/** Summarizes one field selected from every sample. */
export function summarizeSampleMetric(samples, read) {
	return summarizePercentiles(samples.map(read));
}
