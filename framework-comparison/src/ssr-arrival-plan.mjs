import assert from 'node:assert/strict';

/** Validates independent scheduled-demand cases before any worker or socket is created. */
export function validateSsrArrivalPlan(input = {}) {
	const plan = {
		kind: 'independent-arrival-rates',
		preloaded: true,
		drivers: 2,
		rates: input.rates ?? [8000, 10000],
		warmupMs: input.warmupMs ?? 30000,
		measurementMs: input.measurementMs ?? 60000
	};
	if (
		!Array.isArray(plan.rates) ||
		!plan.rates.length ||
		plan.rates.length > 8 ||
		new Set(plan.rates).size !== plan.rates.length ||
		plan.rates.some((rate) => !Number.isSafeInteger(rate) || rate < 2 || rate > 200000)
	)
		throw new TypeError('Expected 1–8 distinct integer offered rates in [2, 200000]');
	for (const key of ['warmupMs', 'measurementMs'])
		if (!Number.isSafeInteger(plan[key]) || plan[key] < 1000 || plan[key] > 3600000)
			throw new TypeError(`${key} must be an integer in [1000, 3600000]`);
	return { ...plan, rates: [...plan.rates] };
}

/**
 * Every case owns a fresh worker, service, and two drivers. The second population reverses
 * both framework and rate order; a rate never inherits another rate's runtime or socket state.
 */
export function ssrArrivalCases(input) {
	const plan = validateSsrArrivalPlan(input);
	const first = plan.rates.flatMap((rate) => ['exact', 'react'].map((id) => ({ id, rate })));
	return [first, [...first].reverse()].flatMap((cases, population) =>
		cases.map(({ id, rate }) => ({
			population,
			id,
			rate,
			stages: [
				{
					name: 'warm-target',
					mode: 'arrival',
					rate: rate / plan.drivers,
					durationMs: plan.warmupMs,
					discard: true
				},
				{
					name: `total-arrivals-${rate}`,
					mode: 'arrival',
					rate: rate / plan.drivers,
					durationMs: plan.measurementMs
				}
			]
		}))
	);
}

/** Rejects isolation claims without distinct workers and sufficient target-rate observation. */
export function assertSsrArrivalIsolation(capture) {
	const plan = validateSsrArrivalPlan(capture.plan);
	assert.ok(
		plan.warmupMs >= 30000,
		'Publication requires at least 30 seconds of target-rate warmup'
	);
	assert.ok(plan.measurementMs >= 60000, 'Publication requires at least 60 seconds of observation');
	const cases = ssrArrivalCases(plan);
	assert.equal(capture.blocks.length, cases.length, 'Each rate requires two framework populations');
	const workers = new Set();
	for (const [index, block] of capture.blocks.entries()) {
		const expected = cases[index];
		for (const key of ['id', 'population', 'rate']) assert.equal(block[key], expected[key]);
		assert.ok(Number.isSafeInteger(block.workerPid) && block.workerPid > 0);
		assert.ok(!workers.has(block.workerPid), 'Each rate case must use a fresh worker');
		workers.add(block.workerPid);
		assert.equal(block.results.length, plan.drivers);
		for (const result of block.results) {
			assert.equal(result.stages.length, 2, 'Each worker measures only one offered rate');
			for (const [stageIndex, stage] of result.stages.entries()) {
				const expectedStage = expected.stages[stageIndex];
				for (const key of ['name', 'mode', 'rate', 'durationMs'])
					assert.equal(stage[key], expectedStage[key], `Invalid ${key} in rate case`);
				assert.equal(Boolean(stage.discard), Boolean(expectedStage.discard));
			}
		}
	}
}
