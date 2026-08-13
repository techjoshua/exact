import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, release, totalmem } from 'node:os';
import { relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { startNativeHarness } from './native-harness.mjs';

if (!process.argv.includes('--correctness-passed')) {
	throw new Error('Run the native measurement script so correctness gates every sample.');
}

const suiteRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(suiteRoot, '..');
const sampleCount = Number(process.env.COMPARISON_SAMPLES ?? 7);
const participants = [
	{ id: 'exact-native', directory: 'exact-native', url: 'http://127.0.0.1:4501' },
	{ id: 'react-native', directory: 'react-native', url: 'http://127.0.0.1:4502' }
];
const metadata = await Promise.all(
	participants.map(async ({ directory }) =>
		JSON.parse(
			await readFile(resolve(suiteRoot, 'participants', directory, 'participant.json'), 'utf8')
		)
	)
);
const unreviewed = metadata.filter((participant) => participant.status !== 'complete');
if (unreviewed.length && !process.argv.includes('--allow-unreviewed')) {
	throw new Error(
		`Publishable native measurement refused: incomplete or unreviewed participants: ${unreviewed.map((item) => item.id).join(', ')}`
	);
}

const builds = Object.fromEntries(
	participants.map((participant) => [participant.id, measureBuild(participant.directory)])
);
const harness = await startNativeHarness();
const browser = await chromium.launch();
try {
	const browserResults = {};
	const serverResults = {};
	for (const participant of participants) {
		browserResults[participant.id] = await measureBrowser(browser, participant);
		serverResults[participant.id] = await measureServer(participant);
	}
	const result = {
		schemaVersion: 1,
		kind: 'framework-comparison-native-raw-run',
		track: 'native-full-stack',
		createdAt: new Date().toISOString(),
		correctness: { status: 'passed', command: 'npm run test:native' },
		publishable: unreviewed.length === 0,
		environment: {
			node: process.version,
			platform: `${platform()} ${release()}`,
			cpu: cpus()[0]?.model ?? 'unknown',
			logicalCpuCount: cpus().length,
			totalMemoryBytes: totalmem()
		},
		harness: {
			commit: git('rev-parse', 'HEAD'),
			workingTreeDirty: git('status', '--porcelain').length > 0,
			sampleCount,
			order: participants.map((participant) => participant.id)
		},
		browser: browserResults,
		server: serverResults,
		build: builds,
		limitations: [
			'Native participants share domain semantics but use separate process-local stores and transports.',
			'Browser and server samples use sequential local loopback probes without throttling.',
			'No result is publishable until both specialist review records are approved.'
		]
	};
	const output = outputPath();
	await mkdir(resolve(output, '..'), { recursive: true });
	await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
	console.log(`Raw native comparison run written to ${relative(repositoryRoot, output)}`);
} finally {
	await browser.close();
	await harness.close();
}

async function measureBrowser(browserInstance, participant) {
	const samples = [];
	for (let index = 0; index < sampleCount; index += 1) {
		console.log(`Measuring ${participant.id} browser sample ${index + 1}/${sampleCount}`);
		await reset(participant.url);
		const context = await browserInstance.newContext();
		const page = await context.newPage();
		const started = performance.now();
		await page.goto(`${participant.url}/incidents/inc-100`, { waitUntil: 'domcontentloaded' });
		await page.getByRole('heading', { name: 'Checkout authorization failures' }).waitFor();
		const readyMs = performance.now() - started;
		const claimStarted = performance.now();
		await page.getByRole('button', { name: 'Claim incident' }).click();
		await page.getByText('Version 2', { exact: true }).waitFor();
		const claimSettlementMs = performance.now() - claimStarted;
		const navigation = await page.evaluate(() => {
			const entry = performance.getEntriesByType('navigation')[0];
			const paint = performance
				.getEntriesByType('paint')
				.find((candidate) => candidate.name === 'first-contentful-paint');
			return {
				durationMs: entry?.duration ?? null,
				domContentLoadedMs: entry?.domContentLoadedEventEnd ?? null,
				firstContentfulPaintMs: paint?.startTime ?? null
			};
		});
		samples.push({ navigation, readyMs, claimSettlementMs });
		await context.close();
	}
	return {
		samples,
		summary: {
			readyP50Ms: percentile(
				samples.map((sample) => sample.readyMs),
				0.5
			),
			claimSettlementP50Ms: percentile(
				samples.map((sample) => sample.claimSettlementMs),
				0.5
			)
		}
	};
}

async function measureServer(participant) {
	await reset(participant.url);
	const samplesMs = [];
	const started = performance.now();
	for (let index = 0; index < 100; index += 1) {
		const requestStarted = performance.now();
		const response = await fetch(`${participant.url}/incidents/inc-100`);
		if (!response.ok) throw new Error(`${participant.id} server probe failed: ${response.status}`);
		await response.arrayBuffer();
		samplesMs.push(performance.now() - requestStarted);
	}
	const elapsedMs = performance.now() - started;
	return {
		samplesMs,
		summary: {
			requestsPerSecond: (samplesMs.length / elapsedMs) * 1_000,
			p50Ms: percentile(samplesMs, 0.5),
			p95Ms: percentile(samplesMs, 0.95),
			p99Ms: percentile(samplesMs, 0.99)
		}
	};
}

async function reset(url) {
	const response = await fetch(`${url}/__benchmark/reset`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: '{}'
	});
	if (!response.ok) throw new Error(`Native reset failed with ${response.status}`);
}

function measureBuild(directory) {
	const started = performance.now();
	if (process.platform === 'win32') {
		execFileSync(
			process.env.ComSpec ?? 'cmd.exe',
			['/d', '/s', '/c', `npm.cmd run build:${directory}`],
			{ cwd: suiteRoot, stdio: 'ignore' }
		);
	} else {
		execFileSync('npm', ['run', `build:${directory}`], { cwd: suiteRoot, stdio: 'ignore' });
	}
	return { cleanBuildMs: performance.now() - started };
}

function percentile(values, fraction) {
	const sorted = [...values].filter(Number.isFinite).sort((left, right) => left - right);
	return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? null;
}

function git(...args) {
	try {
		return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
	} catch {
		return 'unknown';
	}
}

function outputPath() {
	const argument = process.argv.find((value) => value.startsWith('--output='));
	return argument
		? resolve(repositoryRoot, argument.slice('--output='.length))
		: resolve(repositoryRoot, '.tmp', 'framework-comparison', `native-raw-${Date.now()}.json`);
}
