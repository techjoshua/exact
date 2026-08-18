import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { loadExactPackageEnhancements } from '../packages/config/dist/node.js';
import { preparePackageEnhancementSource } from '../packages/compiler/dist/compilation/package-enhancements.js';

import { discoverNativeCompilerCorpus } from './native-compiler-corpus/discovery.mjs';
import {
	nativeBaselineComparison,
	medianNativeCorpusResult,
	medianNativeProjectElapsedMs,
	positiveInteger,
	readNativeCompilerCorpusBaseline,
	writeNativeCompilerCorpusBaseline
} from './native-compiler-corpus/measurement.mjs';

const root = path.resolve(import.meta.dirname, '..');

const updateBaseline = process.argv.includes('--update-baseline');
const discovered = await discoverNativeCompilerCorpus(root);
const projectFilter = process.env.EXACT_NATIVE_CORPUS_PROJECT;
const groups = projectFilter
	? new Map(
			[...discovered.groups].filter(([config]) =>
				path.relative(root, config).replaceAll('\\', '/').includes(projectFilter)
			)
		)
	: discovered.groups;
if (groups.size === 0)
	throw new Error(
		`EXACT_NATIVE_CORPUS_PROJECT matched no projects: ${JSON.stringify(projectFilter)}`
	);
const workers = positiveInteger(
	process.env.EXACT_NATIVE_CORPUS_WORKERS,
	Math.min(4, Math.max(1, os.availableParallelism() - 1)),
	'EXACT_NATIVE_CORPUS_WORKERS'
);
const maxBaselineRatio = positiveNumber(
	process.env.EXACT_NATIVE_CORPUS_MAX_BASELINE_RATIO,
	1.5,
	'EXACT_NATIVE_CORPUS_MAX_BASELINE_RATIO'
);
const sampleCount = positiveInteger(
	process.env.EXACT_NATIVE_CORPUS_SAMPLES,
	3,
	'EXACT_NATIVE_CORPUS_SAMPLES'
);
const executable =
	process.env.EXACT_NATIVE_COMPILER ??
	path.join(
		root,
		'.tmp',
		'native-compiler',
		process.platform === 'win32' ? 'exactc-native.exe' : 'exactc-native'
	);
const corpusInput = {
	executable,
	workers,
	groups: [...groups].map(([config, filenames]) => {
		const { packageEnhancements } = loadExactPackageEnhancements({
			applicationRoot: path.dirname(config)
		});
		return {
			config,
			filenames,
			packageEnhancementSuffixes: Object.fromEntries(
				filenames.flatMap((filename) => {
					const prepared = preparePackageEnhancementSource('', filename, packageEnhancements);
					return prepared.source ? [[filename, prepared.source]] : [];
				})
			)
		};
	})
};
const samples = [];
for (let sample = 0; sample < sampleCount; sample += 1) {
	const started = performance.now();
	const result = await runNativeCorpus(corpusInput);
	samples.push({ ...result, elapsedMs: performance.now() - started });
}
const result = medianNativeCorpusResult(samples);
const projectElapsedByConfig = medianNativeProjectElapsedMs(samples);
const incrementalSamples = [];
for (let sample = 0; sample < sampleCount; sample += 1) {
	incrementalSamples.push(await runNativeCorpus({ ...corpusInput, mode: 'incremental' }));
}
const incrementalResult = medianNativeCorpusResult(incrementalSamples);
const incrementalElapsedByConfig = medianNativeProjectElapsedMs(incrementalSamples);
const incrementalByConfig = new Map(
	incrementalResult.projects.map((project) => [project.config, project])
);
const elapsedMs = result.elapsedMs;
const fileCount = result.fileCount;
const projectCount = groups.size;
const outputBytes = result.outputBytes;
const phaseMicroseconds = result.phaseMicroseconds;
const counters = result.counters;
const projects = result.projects
	.map((project) => ({
		...project,
		// Project guards need their own medians: selecting by aggregate wall time can retain an
		// unrelated per-project scheduling outlier and falsely fail an otherwise stable corpus.
		elapsedMs: projectElapsedByConfig.get(project.config) ?? project.elapsedMs,
		config: path.relative(root, project.config).replaceAll('\\', '/'),
		incrementalElapsedMs:
			incrementalElapsedByConfig.get(project.config) ??
			incrementalByConfig.get(project.config)?.elapsedMs,
		incrementalPhaseMicroseconds: incrementalByConfig.get(project.config)?.phaseMicroseconds,
		incrementalCounters: incrementalByConfig.get(project.config)?.counters
	}))
	.sort((left, right) => right.elapsedMs - left.elapsedMs);
const baseline = await readNativeCompilerCorpusBaseline(root);
const comparison = nativeBaselineComparison(baseline, { ...result, elapsedMs, projects });
const significantProjectRatio = Math.max(
	0,
	...(comparison?.projectRatios ?? [])
		.filter((project) => project.baselineMs >= 250)
		.flatMap((project) => [
			project.ratio,
			project.baselineIncrementalMs >= 50 ? (project.incrementalRatio ?? 0) : 0
		])
);
const record = {
	schemaVersion: 3,
	generatedAt: new Date().toISOString(),
	elapsedMs,
	workers: result.workers,
	fileCount,
	projectCount,
	outputBytes,
	phaseMicroseconds,
	counters,
	incrementalPhaseMicroseconds: incrementalResult.phaseMicroseconds,
	incrementalCounters: incrementalResult.counters,
	projects,
	sampleCount,
	sampleElapsedMs: samples.map((sample) => sample.elapsedMs),
	maxBaselineRatio,
	...(comparison
		? {
				baselineRatio: comparison.ratio,
				guardRatio: Math.max(comparison.ratio, significantProjectRatio),
				baselineComparison: comparison
			}
		: {}),
	node: process.version,
	platform: process.platform,
	arch: process.arch,
	cpu: os.cpus()[0]?.model
};
await mkdir(path.join(root, '.tmp'), { recursive: true });
await writeFile(
	path.join(root, '.tmp', 'native-compiler-corpus.json'),
	`${JSON.stringify(record, null, 2)}\n`
);
if (updateBaseline) await writeNativeCompilerCorpusBaseline(root, record);
console.log(
	`exactc-native compiled ${fileCount} source files across ${projectCount} projects in ${(elapsedMs / 1_000).toFixed(2)}s with ${result.workers} native workers`
);
if (record.baselineRatio !== undefined) {
	const speedup = 1 / record.baselineRatio;
	const comparison =
		speedup >= 1
			? `${speedup.toFixed(2)}x faster than`
			: `${record.baselineRatio.toFixed(2)}x slower than`;
	console.log(
		`native compiler corpus is ${comparison} its tracked baseline (${record.baselineComparison.basis}, ${record.baselineComparison.matchedProjects || projectCount} projects)`
	);
}
for (const [phase, microseconds] of Object.entries(phaseMicroseconds).sort(
	([, left], [, right]) => right - left
))
	console.log(`  ${phase.padEnd(28)} ${(microseconds / 1_000_000).toFixed(2)}s worker time`);
for (const [counter, value] of Object.entries(counters).sort(([, left], [, right]) => right - left))
	console.log(`  ${counter.padEnd(28)} ${value}`);
console.log('  incremental edit totals');
for (const [phase, microseconds] of Object.entries(incrementalResult.phaseMicroseconds).sort(
	([, left], [, right]) => right - left
))
	console.log(`    ${phase.padEnd(26)} ${(microseconds / 1_000_000).toFixed(2)}s worker time`);
for (const [counter, value] of Object.entries(incrementalResult.counters).sort(
	([, left], [, right]) => right - left
))
	console.log(`    ${counter.padEnd(26)} ${value}`);
console.log('  slowest projects');
for (const project of projects.slice(0, 5))
	console.log(
		`    ${project.config.padEnd(44)} ${(project.elapsedMs / 1_000).toFixed(2)}s cold, ${project.incrementalElapsedMs.toFixed(0)}ms edit (${project.fileCount} files, ${(project.phaseMicroseconds.projectLinkMicroseconds / 1_000_000).toFixed(2)}s link)`
	);
if (updateBaseline) {
	console.log('updated docs/performance-baselines/native-compiler-corpus.json');
} else if (record.baselineRatio === undefined) {
	throw new Error(
		'native compiler performance guard requires a comparable tracked native baseline'
	);
}
if (!updateBaseline && record.guardRatio > maxBaselineRatio) {
	throw new Error(
		`native compiler corpus guard ratio ${record.guardRatio.toFixed(2)} exceeded ${maxBaselineRatio.toFixed(2)}`
	);
}

function positiveNumber(value, fallback, label) {
	if (value === undefined || value === '') return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0)
		throw new Error(`${label} must be positive, received ${JSON.stringify(value)}`);
	return parsed;
}

function runNativeCorpus(input) {
	return new Promise((resolve, reject) => {
		const child = spawn(path.resolve(input.executable), ['--corpus'], {
			cwd: root,
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true
		});
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk) => (stdout += chunk));
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.once('error', reject);
		child.once('exit', (code) => {
			if (code !== 0) {
				reject(
					new Error(`native compiler corpus worker exited ${code}${stderr ? `\n${stderr}` : ''}`)
				);
				return;
			}
			try {
				resolve(JSON.parse(stdout));
			} catch (error) {
				reject(new Error(`native compiler corpus worker returned invalid JSON`, { cause: error }));
			}
		});
		child.stdin.end(
			JSON.stringify({ groups: input.groups, workers: input.workers, mode: input.mode })
		);
	});
}
