/** Numeric domain and range accepted by a linear chart scale. */
export interface LinearScale {
	readonly domain: readonly [number, number];
	readonly range: readonly [number, number];
}

/** Maps one finite value through a linear scale. */
export function scaleLinear(scale: LinearScale, value: number): number {
	const [domainStart, domainEnd] = scale.domain;
	const [rangeStart, rangeEnd] = scale.range;
	if (![domainStart, domainEnd, rangeStart, rangeEnd, value].every(Number.isFinite))
		throw new TypeError('Linear scale values must be finite');
	if (domainStart === domainEnd) return (rangeStart + rangeEnd) / 2;
	return rangeStart + ((value - domainStart) / (domainEnd - domainStart)) * (rangeEnd - rangeStart);
}

/** Produces stable inclusive ticks with a human-scale interval. */
export function linearTicks(domain: readonly [number, number], requested = 5): readonly number[] {
	const [start, end] = domain;
	if (!Number.isFinite(start) || !Number.isFinite(end))
		throw new TypeError('Tick domain must be finite');
	if (!Number.isInteger(requested) || requested < 2 || requested > 100)
		throw new RangeError('Tick count must be an integer from 2 through 100');
	if (start === end) return [start];
	const reversed = start > end;
	const low = Math.min(start, end);
	const high = Math.max(start, end);
	const step = niceStep((high - low) / (requested - 1));
	const first = Math.ceil(low / step) * step;
	const ticks: number[] = [];
	for (let value = first; value <= high + step * 1e-10; value += step)
		ticks.push(normalizeTick(value, step));
	if (!ticks.length) ticks.push(low, high);
	return reversed ? ticks.reverse() : ticks;
}

/** Returns the equally spaced center for one categorical value. */
export function scaleCategory(
	values: readonly string[],
	value: string,
	range: readonly [number, number]
): number {
	const index = values.indexOf(value);
	if (index < 0) throw new RangeError(`Unknown chart category ${value}`);
	const width = (range[1] - range[0]) / Math.max(1, values.length);
	return range[0] + width * (index + 0.5);
}

function niceStep(rough: number): number {
	const power = 10 ** Math.floor(Math.log10(rough));
	const normalized = rough / power;
	const factor = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
	return factor * power;
}

function normalizeTick(value: number, step: number): number {
	const decimals = Math.max(0, Math.min(14, -Math.floor(Math.log10(step)) + 1));
	return Number(value.toFixed(decimals));
}
