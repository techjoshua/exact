import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { summarizeValues } from './performance/measurement.mjs';

const workspace = path.resolve(import.meta.dirname, '..');
const worker = path.join(import.meta.dirname, 'performance', 'foundations-worker.mjs');
const availableScenarios = [
	'render-plan',
	'async-ssr',
	'hydration-publication',
	'transport',
	'build-host'
];
const requestedScenario = argument('scenario');
const outputArgument = argument('output');
if (outputArgument && requestedScenario)
	throw new Error('Tracked performance-foundation evidence requires every scenario');
const scenarios = requestedScenario ? [requestedScenario] : availableScenarios;
const samples = positiveInteger(
	process.env.EXACT_PERFORMANCE_FOUNDATION_SAMPLES ?? '5',
	'samples',
	1
);
const marker = 'EXACT_PERFORMANCE_FOUNDATION_SAMPLE=';
const results = [];

for (const scenario of scenarios) {
	if (!availableScenarios.includes(scenario))
		throw new Error(`Unknown performance-foundation scenario ${scenario}`);
	process.stdout.write(`${scenario}: `);
	const observations = [];
	for (let index = 0; index < samples; index++) {
		const output = await runWorker(scenario);
		const line = output.split(/\r?\n/).find((entry) => entry.startsWith(marker));
		if (!line) throw new Error(`${scenario} completed without structured output\n${output}`);
		observations.push(JSON.parse(line.slice(marker.length)).metrics);
		process.stdout.write('.');
	}
	const result = { scenario, samples, metrics: summarizeProcesses(observations) };
	results.push(result);
	process.stdout.write(` ${primarySummary(result.metrics)}\n`);
}

function summarizeProcesses(observations) {
	return Object.fromEntries(
		Object.keys(observations[0]).map((name) => [
			name,
			summarizeValues(observations.map((observation) => observation[name].median))
		])
	);
}

const report = {
	schemaVersion: 1,
	generatedAt: new Date().toISOString(),
	environment: { node: process.version, platform: process.platform, arch: process.arch, samples },
	results
};
if (outputArgument) {
	if (samples < 5) throw new Error('Tracked performance-foundation evidence requires five samples');
	const output = path.resolve(workspace, outputArgument);
	await mkdir(path.dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
	process.stdout.write(`Wrote ${path.relative(workspace, output)}\n`);
}
process.stdout.write(`EXACT_PERFORMANCE_FOUNDATIONS_JSON=${JSON.stringify(report)}\n`);

function runWorker(scenario) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ['--expose-gc', worker], {
			cwd: workspace,
			env: { ...process.env, EXACT_PERFORMANCE_FOUNDATION: scenario },
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true
		});
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk) => (stdout += chunk));
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.once('error', reject);
		child.once('exit', (code, signal) => {
			if (signal) reject(new Error(`${scenario} terminated by ${signal}\n${stderr}`));
			else if (code !== 0) reject(new Error(`${scenario} exited with ${code}\n${stdout}${stderr}`));
			else resolve(stdout);
		});
	});
}

function primarySummary(metrics) {
	const preferred = ['speedup', 'speedupAt4', 'indexedFrameworkBytes', 'validationShare'];
	const name = preferred.find((candidate) => candidate in metrics) ?? Object.keys(metrics)[0];
	return `${name} median ${metrics[name].median.toFixed(2)}`;
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
