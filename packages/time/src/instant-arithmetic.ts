/** Returns the next finite representable timestamp when ordinary boundary arithmetic cannot advance. */
export function nextFiniteInstant(value: number): number | undefined {
	if (!Number.isFinite(value)) throw new TypeError('Clock samples must be finite');
	if (value === 0) return Number.MIN_VALUE;
	const bits = new BigUint64Array(1);
	const number = new Float64Array(bits.buffer);
	number[0] = value;
	bits[0] = bits[0]! + (value > 0 ? 1n : -1n);
	const next = number[0]!;
	return Number.isFinite(next) ? next : undefined;
}
