import { brotliCompressSync, gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { cpus, platform, release, totalmem } from 'node:os';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { measureRetainedHeap } from './browser-memory.mjs';

if (!process.argv.includes('--correctness-passed')) {
	throw new Error('Run `npm run measure` so the shared correctness suite gates every measurement.');
}

const suiteRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(suiteRoot, '..');
const sampleCount = Number(process.env.COMPARISON_SAMPLES ?? 7);
const browserWarmupCount = 1;
const participants = [
	{
		id: 'exact-controlled',
		directory: 'exact',
		source: 'src',
		artifact: 'dist',
		url: 'http://127.0.0.1:4401'
	},
	{
		id: 'react-controlled',
		directory: 'react',
		source: 'src',
		artifact: 'dist',
		url: 'http://127.0.0.1:4402'
	},
	{
		id: 'sveltekit-controlled',
		directory: 'sveltekit',
		source: 'src',
		artifact: 'build/client',
		url: 'http://127.0.0.1:4403'
	},
	{
		id: 'nuxt-controlled',
		directory: 'nuxt',
		source: 'app',
		artifact: '.output/public',
		url: 'http://127.0.0.1:4404'
	}
];

const participantMetadata = await Promise.all(
	participants.map(async (participant) =>
		JSON.parse(
			await readFile(
				resolve(suiteRoot, 'participants', participant.directory, 'participant.json'),
				'utf8'
			)
		)
	)
);
const unreviewed = participantMetadata.filter((metadata) => metadata.status !== 'complete');
if (unreviewed.length > 0 && !process.argv.includes('--allow-unreviewed')) {
	throw new Error(
		`Publishable measurement refused: incomplete or unreviewed participants: ${unreviewed.map((item) => item.id).join(', ')}`
	);
}

const builds = Object.fromEntries(
	participants.map((participant) => [participant.id, measureBuild(participant.directory)])
);
const harness = await import('./e2e-server.mjs');
const browser = await chromium.launch();

try {
	const browserResults = {};
	for (const participant of rotate(
		participants,
		new Date().getUTCSeconds() % participants.length
	)) {
		browserResults[participant.id] = await measureParticipant(browser, participant);
	}
	const result = {
		schemaVersion: 1,
		kind: 'framework-comparison-raw-run',
		createdAt: new Date().toISOString(),
		correctness: { status: 'passed', command: 'npm run test:e2e' },
		publishable: unreviewed.length === 0,
		environment: environmentMetadata(),
		harness: {
			commit: git('rev-parse', 'HEAD'),
			workingTreeDirty: git('status', '--porcelain').length > 0,
			sampleCount,
			browserWarmupCount,
			order: Object.keys(browserResults)
		},
		browser: browserResults,
		server: await measureServer(),
		build: builds,
		complexity: await Promise.all(participants.map(profileParticipant)),
		limitations: [
			'Browser samples use local loopback without network or CPU throttling.',
			'Browser samples are warm: each participant completes one equivalent discarded scenario before measurement.',
			'Chromium heap is an experimental post-GC retained point-in-time signal, not a repeated-lifecycle leak measurement.',
			'Server requests are sequential loopback probes, not a saturation benchmark.'
		]
	};
	const output = outputPath();
	await mkdir(resolve(output, '..'), { recursive: true });
	await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
	console.log(`Raw comparison run written to ${relative(repositoryRoot, output)}`);
} finally {
	await browser.close();
	await harness.close();
}

async function measureParticipant(browserInstance, participant) {
	const samples = [];
	for (let index = 0; index < browserWarmupCount; index += 1)
		await measureBrowserSample(browserInstance, participant);
	for (let index = 0; index < sampleCount; index += 1) {
		samples.push(await measureBrowserSample(browserInstance, participant));
	}
	return {
		temperature: 'warm',
		warmupCount: browserWarmupCount,
		heapMeasurement: 'post-gc-retained',
		samples,
		summary: summarizeBrowser(samples)
	};
}

/** Measures browser-owned event-to-mutation latency without including automation actionability waits. */
async function measureBrowserSample(browserInstance, participant) {
	await resetService({});
	const context = await browserInstance.newContext();
	try {
		const page = await context.newPage();
		await page.addInitScript(installInteractionTiming);
		const session = await context.newCDPSession(page);
		await session.send('Performance.enable');
		// EventSource intentionally keeps the network active, so semantic readiness gates the sample.
		await page.goto(`${participant.url}/incidents/inc-100`, { waitUntil: 'domcontentloaded' });
		await page.getByRole('heading', { name: 'Checkout authorization failures' }).waitFor();
		const navigation = await page.evaluate(() => {
			const entry = performance.getEntriesByType('navigation')[0];
			const paints = Object.fromEntries(
				performance.getEntriesByType('paint').map((paint) => [paint.name, paint.startTime])
			);
			const scripts = performance
				.getEntriesByType('resource')
				.filter((resource) => resource.initiatorType === 'script')
				.reduce((sum, resource) => sum + (resource.transferSize || 0), 0);
			return {
				durationMs: entry?.duration ?? null,
				domContentLoadedMs: entry?.domContentLoadedEventEnd ?? null,
				loadEventMs: entry?.loadEventEnd ?? null,
				firstContentfulPaintMs: paints['first-contentful-paint'] ?? null,
				transferredScriptBytes: scripts
			};
		});
		// Give queued framework activation and browser rendering work one opportunity to settle before
		// collecting retained memory. Navigation timings above remain the original performance entries.
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
		const heapBytes = await measureRetainedHeap(session);
		await page.getByRole('button', { name: 'Claim incident' }).click();
		await page.getByText('Alex Chen', { exact: true }).waitFor();
		await page.getByText('Version 2', { exact: true }).waitFor();
		const timing = await page.evaluate(() => globalThis.__frameworkComparisonTiming);
		if (timing?.optimisticFeedbackMs == null || timing.settlementMs == null)
			throw new Error(`Missing browser interaction timing for ${participant.id}`);
		return {
			navigation,
			heapBytes,
			optimisticFeedbackMs: timing.optimisticFeedbackMs,
			settlementMs: timing.settlementMs
		};
	} finally {
		await context.close();
	}
}

/** Installs a participant-neutral click-to-visible-mutation clock in the page's own time domain. */
function installInteractionTiming() {
	const timing = {
		startedAt: null,
		optimisticFeedbackMs: null,
		settlementMs: null
	};
	globalThis.__frameworkComparisonTiming = timing;
	document.addEventListener(
		'click',
		(event) => {
			const button = event.target instanceof Element ? event.target.closest('button') : null;
			if (button?.textContent?.trim() !== 'Claim incident' || timing.startedAt !== null) return;
			timing.startedAt = performance.now();
		},
		true
	);
	new MutationObserver(() => {
		if (timing.startedAt === null) return;
		const content = document.body?.textContent ?? '';
		const now = performance.now();
		if (timing.optimisticFeedbackMs === null && content.includes('Alex Chen'))
			timing.optimisticFeedbackMs = now - timing.startedAt;
		if (timing.settlementMs === null && content.includes('Version 2'))
			timing.settlementMs = now - timing.startedAt;
	}).observe(document, { childList: true, characterData: true, subtree: true });
}

async function measureServer() {
	await resetService({});
	const durations = [];
	const started = performance.now();
	for (let index = 0; index < 100; index += 1) {
		const requestStarted = performance.now();
		const response = await fetch('http://127.0.0.1:4310/api/incidents');
		if (!response.ok) throw new Error(`Server probe failed with ${response.status}`);
		await response.arrayBuffer();
		durations.push(performance.now() - requestStarted);
	}
	const elapsedMs = performance.now() - started;
	return {
		samplesMs: durations,
		summary: {
			requests: durations.length,
			requestsPerSecond: (durations.length / elapsedMs) * 1_000,
			p50Ms: percentile(durations, 0.5),
			p95Ms: percentile(durations, 0.95),
			p99Ms: percentile(durations, 0.99)
		}
	};
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

async function profileParticipant(participant) {
	const sourceRoot = resolve(suiteRoot, 'participants', participant.directory, participant.source);
	const files = await sourceFiles(sourceRoot);
	let lines = 0;
	let testLines = 0;
	let transportSites = 0;
	let synchronizationSites = 0;
	for (const path of files) {
		const source = await readFile(path, 'utf8');
		const count = source.split(/\r?\n/).length;
		if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) testLines += count;
		else lines += count;
		transportSites += (source.match(/\bfetch\s*\(|\bEventSource\s*\(/g) ?? []).length;
		synchronizationSites += (
			source.match(/optimistic|rollback|conflict|abort|latest|reconnect/gi) ?? []
		).length;
	}
	const artifact = await artifactSizes(
		resolve(suiteRoot, 'participants', participant.directory, participant.artifact)
	);
	return {
		participantId: participant.id,
		authoredProductionLines: lines,
		authoredTestLines: testLines,
		sourceFiles: files.length,
		manualTransportSites: transportSites,
		synchronizationSites,
		artifacts: artifact
	};
}

async function artifactSizes(directory) {
	const files = await allFiles(directory);
	let rawBytes = 0;
	let gzipBytes = 0;
	let brotliBytes = 0;
	for (const path of files) {
		const bytes = await readFile(path);
		rawBytes += bytes.length;
		gzipBytes += gzipSync(bytes).length;
		brotliBytes += brotliCompressSync(bytes).length;
	}
	return { rawBytes, gzipBytes, brotliBytes, files: files.length };
}

async function sourceFiles(directory) {
	return (await allFiles(directory)).filter((path) =>
		['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'].includes(extname(path))
	);
}

async function allFiles(directory) {
	const result = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) result.push(...(await allFiles(path)));
		else if ((await stat(path)).isFile()) result.push(path);
	}
	return result;
}

function summarizeBrowser(samples) {
	return {
		navigationP50Ms: percentile(
			samples.map((sample) => sample.navigation.durationMs),
			0.5
		),
		firstContentfulPaintP50Ms: percentile(
			samples.map((sample) => sample.navigation.firstContentfulPaintMs),
			0.5
		),
		heapP50Bytes: percentile(
			samples.map((sample) => sample.heapBytes),
			0.5
		),
		optimisticFeedbackP50Ms: percentile(
			samples.map((sample) => sample.optimisticFeedbackMs),
			0.5
		),
		settlementP50Ms: percentile(
			samples.map((sample) => sample.settlementMs),
			0.5
		)
	};
}

function percentile(values, quantile) {
	const numbers = values.filter(Number.isFinite).sort((left, right) => left - right);
	if (numbers.length === 0) return null;
	return numbers[Math.min(numbers.length - 1, Math.ceil(numbers.length * quantile) - 1)];
}

async function resetService(body) {
	const response = await fetch('http://127.0.0.1:4310/__benchmark/reset', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-benchmark-control': 'fixture-reset' },
		body: JSON.stringify(body)
	});
	if (!response.ok) throw new Error(`Fixture reset failed with ${response.status}`);
}

function environmentMetadata() {
	const cpu = cpus()[0];
	return {
		node: process.version,
		platform: platform(),
		platformRelease: release(),
		cpu: cpu ? { model: cpu.model, logicalCount: cpus().length } : null,
		totalMemoryBytes: totalmem(),
		chromium: chromium.executablePath()
	};
}

function git(...arguments_) {
	return execFileSync('git', arguments_, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
}

function rotate(values, offset) {
	return [...values.slice(offset), ...values.slice(0, offset)];
}

function outputPath() {
	const option = process.argv.find((argument) => argument.startsWith('--output='));
	if (option) return resolve(repositoryRoot, option.slice('--output='.length));
	return resolve(repositoryRoot, '.tmp', 'framework-comparison', `raw-${Date.now()}.json`);
}
