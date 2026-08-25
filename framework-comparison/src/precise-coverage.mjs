/** Counts intervals using the narrowest V8 range, so uncalled bodies override their script root. */
export function preciseExecutedBytes(ranges) {
	const valid = ranges.filter(
		(range) =>
			Number.isFinite(range.startOffset) &&
			Number.isFinite(range.endOffset) &&
			range.endOffset > range.startOffset
	);
	const boundaries = [
		...new Set(valid.flatMap((range) => [range.startOffset, range.endOffset]))
	].sort((left, right) => left - right);
	let total = 0;
	for (let index = 1; index < boundaries.length; index++) {
		const start = boundaries[index - 1];
		const end = boundaries[index];
		const owner = valid
			.filter((range) => range.startOffset <= start && range.endOffset >= end)
			.sort(
				(left, right) => left.endOffset - left.startOffset - (right.endOffset - right.startOffset)
			)[0];
		if (owner?.count > 0) total += end - start;
	}
	return total;
}
