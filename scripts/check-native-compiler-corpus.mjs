import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { discoverNativeCompilerCorpus } from './native-compiler-corpus/discovery.mjs';
import {
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
const executable =
	process.env.EXACT_NATIVE_COMPILER ??
	path.join(
		root,
		'.tmp',
		'native-compiler',
		process.platform === 'win32' ? 'exactc-native.exe' : 'exactc-native'
	);
const started = performance.now();
const result = await runNativeCorpus({
	executable,
	workers,
	groups: [...groups].map(([config, filenames]) => ({ config, filenames }))
});
const elapsedMs = performance.now() - started;
const fileCount = result.fileCount;
const projectCount = groups.size;
const outputBytes = result.outputBytes;
const phaseMicroseconds = result.phaseMicroseconds;
const projects = result.projects.sort((left, right) => right.elapsedMs - left.elapsedMs);
const baseline = await readNativeCompilerCorpusBaseline(root);
const normalizedBaselineMs =
	baseline?.fileCount && baseline.elapsedMs && baseline.workers === result.workers
		? baseline.elapsedMs * (fileCount / baseline.fileCount)
		: undefined;
const record = {
	schemaVersion: 2,
	generatedAt: new Date().toISOString(),
	elapsedMs,
	workers: result.workers,
	fileCount,
	projectCount,
	outputBytes,
	phaseMicroseconds,
	projects,
	maxBaselineRatio,
	...(normalizedBaselineMs
		? {
				nativeBaselineElapsedMs: baseline.elapsedMs,
				normalizedNativeBaselineMs: normalizedBaselineMs,
				baselineRatio: elapsedMs / normalizedBaselineMs
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
		`native compiler corpus is ${comparison} its tracked baseline normalized to ${fileCount} files (${(record.normalizedNativeBaselineMs / 1_000).toFixed(2)}s)`
	);
}
for (const [phase, microseconds] of Object.entries(phaseMicroseconds).sort(
	([, left], [, right]) => right - left
))
	console.log(`  ${phase.padEnd(28)} ${(microseconds / 1_000_000).toFixed(2)}s worker time`);
console.log('  slowest projects');
for (const project of projects.slice(0, 5))
	console.log(
		`    ${path.relative(root, project.config).padEnd(44)} ${(project.elapsedMs / 1_000).toFixed(2)}s (${project.fileCount} files, ${(project.callableMicroseconds / 1_000_000).toFixed(2)}s callable)`
	);
if (updateBaseline) {
	console.log('updated docs/performance-baselines/native-compiler-corpus.json');
} else if (record.baselineRatio === undefined) {
	throw new Error(
		'native compiler performance guard requires a comparable tracked native baseline'
	);
}
if (!updateBaseline && record.baselineRatio > maxBaselineRatio) {
	throw new Error(
		`native compiler corpus ratio ${record.baselineRatio.toFixed(2)} exceeded ${maxBaselineRatio.toFixed(2)}`
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
		child.stdin.end(JSON.stringify({ groups: input.groups, workers: input.workers }));
	});
}
