import { mkdtemp, rm } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { buildServerPerformanceFixture } from './performance/fixture-build.mjs';
import { measureServerLoad } from './performance/server-load-measurement.mjs';

const workspace = path.resolve(import.meta.dirname, '..');
const concurrency = positiveInteger(process.env.EXACT_SERVER_BENCH_CONCURRENCY ?? '32');
const warmupRequests = positiveInteger(process.env.EXACT_SERVER_BENCH_WARMUPS ?? '256');
const rounds = positiveInteger(process.env.EXACT_SERVER_BENCH_ROUNDS ?? '6');
const roundDurationMs = positiveInteger(process.env.EXACT_SERVER_BENCH_ROUND_MS ?? '2000');
const requestedRuntime = process.argv.find((value) => value.startsWith('--runtime='))?.slice(10);
const lanes = [
	{ id: 'node', runtime: 'node', transport: 'node-http', worker: 'server-load-worker.mjs' },
	{
		id: 'bun-portable',
		runtime: 'bun',
		transport: 'node-http-compat',
		worker: 'server-load-worker.mjs'
	},
	{
		id: 'bun-native',
		runtime: 'bun',
		transport: 'bun-serve',
		worker: 'server-load-worker-bun.mjs'
	}
];
const selectedLanes = requestedRuntime
	? lanes.filter(
			(lane) =>
				lane.id === requestedRuntime || (requestedRuntime === 'bun' && lane.runtime === 'bun')
		)
	: lanes;
if (selectedLanes.length === 0) throw new Error(`Unknown server runtime ${requestedRuntime}`);

const temporary = await mkdtemp(path.join(workspace, '.exact-server-performance-'));
try {
	process.stdout.write('Building compiler-closed production SSR fixture...\n');
	const fixtureBuild = await buildServerPerformanceFixture(temporary);
	const results = [];
	for (const lane of selectedLanes) {
		process.stdout.write(
			`${lane.id}: ${rounds} x ${(roundDurationMs / 1_000).toFixed(1)}s at concurrency ${concurrency}...\n`
		);
		const result = await measureServerLoad({
			worker: path.join(import.meta.dirname, 'performance', lane.worker),
			fixture: fixtureBuild.path,
			runtime: lane.runtime,
			transport: lane.transport,
			concurrency,
			warmupRequests,
			rounds,
			roundDurationMs
		});
		results.push(result);
		process.stdout.write(
			`${lane.id}: ${result.throughputRequestsPerSecond.toFixed(1)} req/s; latency p50 ${result.latencyMs.p50.toFixed(2)}ms p95 ${result.latencyMs.p95.toFixed(2)}ms; heap drift ${result.memory.postGcHeapDriftBytes} bytes\n`
		);
	}
	process.stdout.write(
		`EXACT_SERVER_BENCHMARK_JSON=${JSON.stringify({
			schemaVersion: 1,
			generatedAt: new Date().toISOString(),
			environment: {
				node: process.version,
				platform: `${platform()} ${release()}`,
				cpu: cpus()[0]?.model ?? 'unknown',
				concurrency,
				warmupRequests,
				rounds,
				roundDurationMs
			},
			bundle: fixtureBuild.bytes,
			results
		})}\n`
	);
} finally {
	await rm(temporary, { recursive: true, force: true });
}

function positiveInteger(value) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1)
		throw new Error(`${value} must be a positive integer`);
	return parsed;
}
