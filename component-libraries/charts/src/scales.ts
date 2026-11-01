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
	const span = rangeEnd - rangeStart;
	if (domainStart === domainEnd)
		return Number.isFinite(span) ? rangeStart + span / 2 : rangeStart / 2 + rangeEnd / 2;
	let fraction = (value - domainStart) / (domainEnd - domainStart);
	if (!Number.isFinite(value - domainStart) || !Number.isFinite(domainEnd - domainStart)) {
		const magnitude = Math.max(Math.abs(domainStart), Math.abs(domainEnd), Math.abs(value));
		fraction =
			(value / magnitude - domainStart / magnitude) /
			(domainEnd / magnitude - domainStart / magnitude);
	}
	let result = rangeStart + fraction * span;
	if (!Number.isFinite(result)) {
		const magnitude = Math.max(Math.abs(rangeStart), Math.abs(rangeEnd));
		result =
			(rangeStart / magnitude + fraction * (rangeEnd / magnitude - rangeStart / magnitude)) *
			magnitude;
	}
	if (!Number.isFinite(result)) throw new RangeError('Linear scale result must be finite');
	return result;
}

/** Produces ordered, distinct finite ticks with bounded work, including narrow large domains. */
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
	const count = Math.floor((high - first) / step + 1e-10) + 1;
	// Integer indexing guarantees progress when a floating-point increment cannot change a value.
	if (!Number.isFinite(first) || !Number.isSafeInteger(count) || count < 1 || count > 300)
		return reversed ? [high, low] : [low, high];
	const ticks: number[] = [];
	for (let index = 0; index < count; index++) {
		const value = normalizeTick(first + index * step, step);
		if (Number.isFinite(value) && (ticks.length === 0 || value > ticks[ticks.length - 1]!))
			ticks.push(value);
	}
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
	if (step < 1e-14) return Number(value.toPrecision(15));
	const decimals = Math.max(0, Math.min(14, -Math.floor(Math.log10(step)) + 1));
	return Number(value.toFixed(decimals));
}
