import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildPerformanceFixtures } from './performance/fixture-build.mjs';
import { measureChromium } from './performance/browser-measurement.mjs';
import {
	runBuildWorker,
	runFrameworkWorker,
	summarizeBuildSamples,
	summarizeScenario
} from './performance/measurement.mjs';

const workspace = path.resolve(import.meta.dirname, '..');
const samples = positiveInteger(process.env.EXACT_FRAMEWORK_BENCH_SAMPLES ?? '5', 'samples', 1);
const warmups = positiveInteger(process.env.EXACT_FRAMEWORK_BENCH_WARMUPS ?? '2', 'warmups', 0);
const buildSampleCount = positiveInteger(
	process.env.EXACT_FRAMEWORK_BENCH_BUILD_SAMPLES ?? String(samples),
	'build samples',
	1
);
const nodeOnly = process.argv.includes('--node-only');
const keepTemporary = process.argv.includes('--keep-temporary');
const outputArgument = argument('output') ?? process.env.EXACT_FRAMEWORK_BENCH_OUTPUT;
const scenarioFilter = argument('scenario') ?? process.env.EXACT_FRAMEWORK_BENCH_SCENARIO;
const workerRuntime =
	argument('worker-runtime') ?? process.env.EXACT_FRAMEWORK_BENCH_RUNTIME ?? 'node';
if (workerRuntime !== 'node' && workerRuntime !== 'bun')
	throw new Error(`Unknown performance worker runtime ${workerRuntime}`);
const outputPath = outputArgument ? path.resolve(workspace, outputArgument) : undefined;
const temporary = await mkdtemp(path.join(workspace, '.exact-performance-'));
const worker = path.join(import.meta.dirname, 'performance', 'framework-worker.mjs');
const buildWorker = path.join(import.meta.dirname, 'performance', 'build-worker.mjs');

try {
	process.stdout.write(
		'Building compiler-owned performance fixtures through the Vite adapter...\n'
	);
	const fixtureBuild = await buildPerformanceFixtures(temporary);
	const buildMeasurements = [{ elapsedMs: fixtureBuild.elapsedMs, bytes: fixtureBuild.bytes }];
	for (let index = 1; index < buildSampleCount; index++)
		buildMeasurements.push(await runBuildWorker(buildWorker));
	const buildSummary = summarizeBuildSamples(buildMeasurements);
	process.stdout.write(
		`production fixture build: median ${buildSummary.elapsedMs.median.toFixed(1)}ms; p95 ${buildSummary.elapsedMs.p95.toFixed(1)}ms\n`
	);
	const clientModule = await import(
		`${pathToFileURL(fixtureBuild.paths.client).href}?catalog=client`
	);
	const serverModule = await import(
		`${pathToFileURL(fixtureBuild.paths.server).href}?catalog=server`
	);
	const allNodeScenarios = [
		...clientModule.clientScenarioNames,
		...serverModule.serverScenarioNames
	];
	const nodeScenarios = scenarioFilter
		? allNodeScenarios.filter((scenario) => scenario === scenarioFilter)
		: allNodeScenarios;
	if (nodeScenarios.length === 0) throw new Error(`Unknown framework scenario ${scenarioFilter}`);
	const nodeResults = [];
	for (const scenario of nodeScenarios) {
		const fixture = scenario.startsWith('server.')
			? fixtureBuild.paths.server
			: fixtureBuild.paths.client;
		const scenarioSamples = [];
		process.stdout.write(`${scenario}: `);
		for (let index = 0; index < samples; index++) {
			scenarioSamples.push(
				await runFrameworkWorker(worker, scenario, fixture, warmups, workerRuntime)
			);
			process.stdout.write('.');
		}
		const summary = summarizeScenario(scenario, scenarioSamples);
		nodeResults.push(summary);
		process.stdout.write(` ${primarySummary(summary)}\n`);
	}

	const chromium = nodeOnly ? undefined : await measureChromium(temporary, samples, warmups);
	if (chromium)
		process.stdout.write(
			`${chromium.browser} module evaluation: median ${chromium.moduleEvaluationMs.median.toFixed(2)}ms\n`
		);

	const report = {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		buildIdentity: repositoryIdentity(),
		environment: {
			node: process.version,
			workerRuntime,
			platform: `${platform()} ${release()}`,
			cpu: cpus()[0]?.model ?? 'unknown',
			samples,
			buildSamples: buildSampleCount,
			warmups,
			chromium: chromium?.browser ?? null
		},
		fixtureBuild: buildSummary,
		node: nodeResults,
		...(chromium ? { chromium } : {}),
		complete: Boolean(chromium)
	};

	if (outputPath) {
		if (!report.complete)
			throw new Error(
				'A tracked framework baseline must include current Chromium; remove --node-only'
			);
		await mkdir(path.dirname(outputPath), { recursive: true });
		await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
		process.stdout.write(`Wrote ${path.relative(workspace, outputPath)}\n`);
	}
	process.stdout.write(`EXACT_FRAMEWORK_BENCHMARK_JSON=${JSON.stringify(report)}\n`);
} finally {
	if (keepTemporary) process.stdout.write(`Kept temporary fixtures at ${temporary}\n`);
	else await rm(temporary, { recursive: true, force: true });
}

function primarySummary(summary) {
	const [name, measurement] = Object.entries(summary.metrics).find(([metric]) =>
		metric.toLowerCase().endsWith('ms')
	) ?? ['moduleEvaluationMs', summary.moduleEvaluationMs];
	return `${name} median ${measurement.median.toFixed(2)}ms; p95 ${measurement.p95.toFixed(2)}ms`;
}

function positiveInteger(value, name, minimum) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minimum)
		throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
	return parsed;
}

function argument(name) {
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function repositoryIdentity() {
	const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
		cwd: workspace,
		encoding: 'utf8'
	}).trim();
	const dirty =
		execFileSync('git', ['status', '--short'], {
			cwd: workspace,
			encoding: 'utf8'
		}).trim().length > 0;
	return { commit, dirty };
}
