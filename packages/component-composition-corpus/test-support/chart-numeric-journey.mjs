/** Checks finite scale results and bounded progress through extreme numeric domains. */
export function verifyChartNumericValues({ linearTicks, scaleLinear }) {
	for (const domain of [
		[1e16, 1e16 + 2],
		[0, Number.MIN_VALUE],
		[-1e308, 1e308],
		[1e-20, 9e-20]
	]) {
		const ticks = linearTicks(domain, 100);
		if (
			!ticks.length ||
			ticks.length > 300 ||
			!ticks.every(Number.isFinite) ||
			!ticks.every((value, index) => index === 0 || value > ticks[index - 1])
		)
			throw new Error('Chart ticks must make bounded finite progress');
		if (
			JSON.stringify(linearTicks([...domain].reverse(), 100)) !==
			JSON.stringify([...ticks].reverse())
		)
			throw new Error('Reversed chart ticks must retain identity');
	}
	for (const [domain, range, value, expected] of [
		[[-1e308, 1e308], [0, 100], 0, 50],
		[[1e308, -1e308], [0, 100], 0, 50],
		[[1, 1], [1e308, 1e308], 1, 1e308],
		[[0, 1], [-1e308, 1e308], 0.5, 0]
	])
		if (scaleLinear({ domain, range }, value) !== expected)
			throw new Error('Finite chart endpoints must avoid intermediate overflow');
	return true;
}
