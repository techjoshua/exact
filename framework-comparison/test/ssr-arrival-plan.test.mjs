import assert from 'node:assert/strict';
import test from 'node:test';
import {
	validateSsrArrivalPlan,
	ssrArrivalCases,
	assertSsrArrivalIsolation
} from '../src/ssr-arrival-plan.mjs';
import { validateSsrLoadPlan } from '../src/ssr-load-plan.mjs';

test('each rate gets its own target-rate warmup and measured stage in both framework orders', () => {
	const plan = validateSsrArrivalPlan();
	const cases = ssrArrivalCases(plan);
	assert.equal(cases.length, 8);
	const first = cases
		.filter((entry) => entry.population === 0)
		.map(({ id, rate }) => ({ id, rate }));
	const second = cases
		.filter((entry) => entry.population === 1)
		.map(({ id, rate }) => ({ id, rate }));
	assert.deepEqual(second, [...first].reverse());
	for (const entry of cases) {
		assert.equal(entry.stages.length, 2);
		assert.equal(entry.stages[0].discard, true);
		assert.equal(entry.stages[0].durationMs, 30000);
		assert.equal(entry.stages[1].durationMs, 60000);
		for (const stage of entry.stages) {
			assert.equal(stage.mode, 'arrival');
			assert.equal(stage.rate * 2, entry.rate);
		}
		validateSsrLoadPlan({ url: 'http://127.0.0.1/', stages: entry.stages });
	}
	cases[0].stages[0].rate = 1;
	assert.equal(cases.at(-1).stages[0].rate, 4000);
	assert.deepEqual(plan.rates, [8000, 10000]);
});

test('rejects invalid rates and timing before processes can start', () => {
	for (const rates of [[], [0], [NaN], [8000, 8000], [200001], [2.5], '8000'])
		assert.throws(() => validateSsrArrivalPlan({ rates }), TypeError);
	for (const key of ['warmupMs', 'measurementMs'])
		for (const value of [0, 999, NaN, 1000.5, 3600001])
			assert.throws(() => validateSsrArrivalPlan({ [key]: value }), TypeError);
});

test('publication rejects shared workers, mismatched warmup rates, and short observation', () => {
	const plan = validateSsrArrivalPlan();
	const capture = {
		plan,
		blocks: ssrArrivalCases(plan).map(({ stages, ...entry }, index) => ({
			...entry,
			workerPid: index + 100,
			results: [0, 1].map(() => ({ stages: structuredClone(stages) }))
		}))
	};
	assertSsrArrivalIsolation(capture);
	const shared = structuredClone(capture);
	shared.blocks[2].workerPid = shared.blocks[0].workerPid;
	assert.throws(() => assertSsrArrivalIsolation(shared), /fresh worker/);
	const differentRate = structuredClone(capture);
	differentRate.blocks[0].results[0].stages[0].rate = 5000;
	assert.throws(() => assertSsrArrivalIsolation(differentRate), /Invalid rate/);
	for (const key of ['warmupMs', 'measurementMs']) {
		const short = structuredClone(capture);
		short.plan[key] = 10000;
		assert.throws(() => assertSsrArrivalIsolation(short), /Publication requires/);
	}
});
