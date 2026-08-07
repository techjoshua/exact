import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { buildPerformanceFixtures } from './performance/fixture-build.mjs';
import { runFrameworkWorker, summarizeScenario } from './performance/measurement.mjs';

const workspace = path.resolve(import.meta.dirname, '..');
const samples = integerEnvironment('EXACT_DOM_BENCH_SAMPLES', 5, 1);
const warmups = integerEnvironment('EXACT_DOM_BENCH_WARMUPS', 2, 0);
const temporary = await mkdtemp(path.join(workspace, '.exact-dom-list-'));
const worker = path.join(import.meta.dirname, 'performance', 'framework-worker.mjs');
const scenario = 'client.keyed-list-update';

try {
	const fixtures = await buildPerformanceFixtures(temporary);
	const measurements = [];
	for (let index = 0; index < samples; index++)
		measurements.push(await runFrameworkWorker(worker, scenario, fixtures.paths.client, warmups));
	const summary = summarizeScenario(scenario, measurements);
	const update = summary.metrics.updateMs;
	if (!update) throw new Error('compiled DOM benchmark completed without an updateMs measurement');
	if (update.p95 > 2_000)
		throw new Error(`1k keyed rotation exceeded 2000ms p95 budget (${update.p95.toFixed(1)}ms)`);
	process.stdout.write(
		`compiled keyed 1k rotation: median ${update.median.toFixed(2)}ms; p95 ${update.p95.toFixed(2)}ms across ${samples} isolated processes\n`
	);
	process.stdout.write(`DOM_LIST_BENCHMARK_JSON=${JSON.stringify(summary)}\n`);
} finally {
	await rm(temporary, { recursive: true, force: true });
}

function integerEnvironment(name, fallback, minimum) {
	const value = Number(process.env[name] ?? fallback);
	if (!Number.isInteger(value) || value < minimum)
		throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
	return value;
}
