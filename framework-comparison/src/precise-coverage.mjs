/** Counts intervals using the narrowest V8 range, so uncalled bodies override their script root. */
export function preciseExecutedBytes(ranges) {
	return preciseExecutedIntervals(ranges).reduce(
		(sum, interval) => sum + interval.endOffset - interval.startOffset,
		0
	);
}

/** Returns non-overlapping V8 ranges whose narrowest owning range executed. */
export function preciseExecutedIntervals(ranges) {
	const valid = ranges.filter(
		(range) =>
			Number.isFinite(range.startOffset) &&
			Number.isFinite(range.endOffset) &&
			range.endOffset > range.startOffset
	);
	const boundaries = [
		...new Set(valid.flatMap((range) => [range.startOffset, range.endOffset]))
	].sort((left, right) => left - right);
	const intervals = [];
	for (let index = 1; index < boundaries.length; index++) {
		const start = boundaries[index - 1];
		const end = boundaries[index];
		const owner = valid
			.filter((range) => range.startOffset <= start && range.endOffset >= end)
			.sort(
				(left, right) => left.endOffset - left.startOffset - (right.endOffset - right.startOffset)
			)[0];
		if (owner?.count > 0) intervals.push({ startOffset: start, endOffset: end });
	}
	return intervals;
}
