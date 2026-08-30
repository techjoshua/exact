import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const adjacentNpm = path.join(
	path.dirname(process.execPath),
	'node_modules',
	'npm',
	'bin',
	'npm-cli.js'
);
const npmCli = process.env.npm_execpath ?? (existsSync(adjacentNpm) ? adjacentNpm : undefined);
const npm = npmCli ? { file: process.execPath, args: [npmCli] } : { file: 'npm', args: [] };
const sampleCount = Number(process.env.EXACT_REACT_COMPAT_BENCH_SAMPLES ?? 5);
if (!Number.isSafeInteger(sampleCount) || sampleCount <= 0)
	throw new Error('EXACT_REACT_COMPAT_BENCH_SAMPLES must be a positive integer');
const results = [];
for (const workspace of ['@exactjs/react-reference-18', '@exactjs/react-reference-19']) {
	const samples = [];
	for (let index = 0; index < sampleCount; index++) {
		const output = execFileSync(
			npm.file,
			[...npm.args, 'run', 'benchmark', '-w', workspace, '--silent'],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
		);
		samples.push(JSON.parse(output.trim()));
	}
	const durations = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
	const result = {
		baseline: samples[0].baseline,
		iterations: samples[0].iterations,
		bytes: samples[0].bytes,
		p50Ms: percentile(durations, 0.5),
		p75Ms: percentile(durations, 0.75),
		p95Ms: percentile(durations, 0.95),
		p99Ms: percentile(durations, 0.99),
		rawSamples: samples
	};
	results.push(result);
	console.log(
		`React ${result.baseline} reference: ${result.iterations} renders, ${result.bytes} bytes, p50 ${result.p50Ms.toFixed(1)}ms, p95 ${result.p95Ms.toFixed(1)}ms`
	);
}
console.log(`REACT_COMPAT_BENCHMARK_JSON=${JSON.stringify({ results })}`);

function percentile(sorted, fraction) {
	return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}
