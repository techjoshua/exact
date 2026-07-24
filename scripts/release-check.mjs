import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { createAffectedReleasePlan } from './release-affected.mjs';

const root = path.resolve(import.meta.dirname, '..');
const profile = argument('profile') ?? 'check';
const npmCli =
	process.env.npm_execpath ??
	(process.platform === 'win32'
		? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
		: undefined);
const npmCommand =
	npmCli && existsSync(npmCli)
		? { command: process.execPath, prefix: [npmCli] }
		: { command: 'npm', prefix: [] };
const timings = [];
const started = performance.now();
const sharedEnvironment = {
	...process.env,
	EXACT_RELEASE_BUILT: '1'
};

const task = (name, args, options = {}) => ({
	name,
	command: options.command ?? npmCommand.command,
	args: options.command ? args : [...npmCommand.prefix, ...args],
	environment: { ...sharedEnvironment, ...options.environment }
});

const build = task('build', ['run', 'build']);
const typescript7Compatibility = task('TypeScript 7 compatibility', [
	'run',
	'build:typescript7',
	'--',
	'--force'
]);
const staticChecks = [
	task('style', ['run', 'check:style']),
	task('platform boundaries', ['run', 'check:platform-boundaries']),
	task('source architecture', ['run', 'check:source-architecture']),
	task('JSDoc contracts', ['run', 'check:jsdoc']),
	task('test typecheck', ['run', 'typecheck:tests']),
	task('package contents', ['run', 'check:publish'])
];
const expressionCorpus = task('expression corpus', ['run', 'check:expressions']);
const sampleBuilds = [
	task('Kanban build', ['run', 'build:kanban']),
	task('Workbench build', ['run', 'build:workbench'])
];
const testSuite = task('test suite', ['test']);
const reactCompatibility = task('React compatibility', ['run', 'check:react-compat:built']);
const r3fBrowser = task('R3F browser matrix', ['run', 'check:r3f-browser:built']);
const performanceChecks = [
	task('reactive benchmarks', ['run', 'benchmark:reactive']),
	task('expression benchmarks', ['run', 'benchmark:expressions']),
	task('React compatibility benchmark', ['run', 'benchmark:react-compat'])
];

let failure;
try {
	if (!['affected', 'check', 'quick', 'full', 'performance'].includes(profile)) {
		throw new Error(`Unknown release profile "${profile}"`);
	}
	await run(build);
	await run(typescript7Compatibility);
	if (profile === 'affected') {
		await runAffected();
	} else if (profile !== 'performance') {
		await runPool(staticChecks, 3);
		await run(expressionCorpus);
		await runPool(sampleBuilds, 2);
		await run(testSuite);
		if (profile !== 'quick') {
			await run(reactCompatibility);
			await run(r3fBrowser);
		}
	}
	if (profile === 'full' || profile === 'performance') {
		for (const benchmark of performanceChecks) await run(benchmark);
	}
} catch (error) {
	failure = error;
} finally {
	const elapsedMs = performance.now() - started;
	printSummary(elapsedMs);
	await mkdir(path.join(root, '.tmp'), { recursive: true });
	await writeFile(
		path.join(root, '.tmp', `release-timings-${profile}.json`),
		`${JSON.stringify(
			{
				schemaVersion: 1,
				profile,
				generatedAt: new Date().toISOString(),
				elapsedMs,
				phases: timings
			},
			null,
			2
		)}\n`
	);
}

if (failure) throw failure;

async function run(entry) {
	const phaseStarted = performance.now();
	process.stdout.write(`\n[release:${profile}] ${entry.name}\n`);
	const exitCode = await new Promise((resolve, reject) => {
		const child = spawn(entry.command, entry.args, {
			cwd: root,
			env: entry.environment,
			stdio: 'inherit',
			windowsHide: true
		});
		child.once('error', reject);
		child.once('exit', (code, signal) => {
			if (signal) reject(new Error(`${entry.name} terminated by ${signal}`));
			else resolve(code ?? 1);
		});
	});
	const elapsedMs = performance.now() - phaseStarted;
	timings.push({ name: entry.name, elapsedMs, status: exitCode === 0 ? 'passed' : 'failed' });
	if (exitCode !== 0) throw new Error(`${entry.name} failed with exit code ${exitCode}`);
}

async function runPool(entries, concurrency) {
	const queue = [...entries];
	const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
		while (queue.length) await run(queue.shift());
	});
	await Promise.all(workers);
}

function printSummary(elapsedMs) {
	const width = Math.max(5, ...timings.map((value) => value.name.length));
	process.stdout.write(`\nRelease ${profile} timing summary\n`);
	for (const timing of timings) {
		process.stdout.write(
			`${timing.name.padEnd(width)}  ${(timing.elapsedMs / 1000).toFixed(1).padStart(7)}s  ${timing.status}\n`
		);
	}
	process.stdout.write(
		`${'total'.padEnd(width)}  ${(elapsedMs / 1000).toFixed(1).padStart(7)}s  ${failure ? 'failed' : 'passed'}\n`
	);
}

function argument(name) {
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function runAffected() {
	const plan = await createAffectedReleasePlan(argument('base'));
	process.stdout.write(
		`[release:affected] ${plan.changedFiles.length} changed files affect ${plan.workspaces.length} workspaces\n`
	);
	const checks = [
		task('style', ['run', 'check:style']),
		task('platform boundaries', ['run', 'check:platform-boundaries']),
		task('source architecture', ['run', 'check:source-architecture']),
		task('JSDoc contracts', ['run', 'check:jsdoc']),
		task('test typecheck', ['run', 'typecheck:tests']),
		task('package contents', ['run', 'check:publish'])
	];
	if (plan.expressions) checks.push(task('expression corpus', ['run', 'check:expressions']));
	await runPool(checks, 3);

	const verification = [];
	if (plan.packageTestDirectories.length) {
		verification.push(
			task('affected package tests', [
				'exec',
				'--',
				'vitest',
				'run',
				...plan.packageTestDirectories,
				'--testTimeout=15000'
			])
		);
	}
	if (plan.apps.serverComponents)
		verification.push(task('server-component tests', ['run', 'test:server-components']));
	if (plan.apps.shipping) verification.push(task('shipping tests', ['run', 'test:shipping']));
	if (plan.apps.kanban) verification.push(task('Kanban build', ['run', 'build:kanban']));
	if (plan.apps.workbench) verification.push(task('Workbench build', ['run', 'build:workbench']));
	await runPool(verification, 2);

	if (plan.reactCompatibility) await run(reactCompatibility);
	if (plan.r3fBrowser) await run(r3fBrowser);
}
