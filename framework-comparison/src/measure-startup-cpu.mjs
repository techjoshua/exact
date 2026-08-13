import { execFileSync } from 'node:child_process';
import { cpus, platform, release, totalmem } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { chromium } from 'playwright';
import { analyzeStartupTrace, startupPercentile } from './startup-cpu-analysis.mjs';

if (!process.argv.includes('--correctness-passed')) {
	throw new Error(
		'Run `npm run measure:startup-cpu` so the shared correctness suite gates CPU profiling.'
	);
}

const suiteRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(suiteRoot, '..');
const sampleCount = positiveInteger(process.env.COMPARISON_STARTUP_SAMPLES, 10);
const throttleRates = throttleRateList(process.env.COMPARISON_CPU_RATES ?? '1,4,6');
const participants = [
	{ id: 'exact-controlled', directory: 'exact', url: 'http://127.0.0.1:4401' },
	{ id: 'react-controlled', directory: 'react', url: 'http://127.0.0.1:4402' },
	{ id: 'sveltekit-controlled', directory: 'sveltekit', url: 'http://127.0.0.1:4403' },
	{ id: 'nuxt-controlled', directory: 'nuxt', url: 'http://127.0.0.1:4404' }
];

const metadata = await Promise.all(
	participants.map(async ({ directory }) =>
		JSON.parse(
			await readFile(resolve(suiteRoot, 'participants', directory, 'participant.json'), 'utf8')
		)
	)
);
const unreviewed = metadata.filter((entry) => entry.status !== 'complete');
if (unreviewed.length && !process.argv.includes('--allow-unreviewed')) {
	throw new Error(
		`Publishable measurement refused: incomplete or unreviewed participants: ${unreviewed.map((entry) => entry.id).join(', ')}`
	);
}

const harness = await import('./e2e-server.mjs');
const browser = await chromium.launch();

try {
	const profiles = {};
	for (const rate of throttleRates) {
		const rateResults = {};
		for (const participant of rotate(participants, rate % participants.length)) {
			const samples = [];
			for (let index = 0; index < sampleCount; index++) {
				console.log(
					`Profiling ${participant.id} at ${rate}x CPU sample ${index + 1}/${sampleCount}`
				);
				samples.push(await measureColdStartup(browser, participant, rate));
			}
			rateResults[participant.id] = { samples, summary: summarizeSamples(samples) };
		}
		profiles[`${rate}x`] = rateResults;
	}

	const result = {
		schemaVersion: 1,
		kind: 'framework-comparison-startup-cpu-profile',
		createdAt: new Date().toISOString(),
		correctness: { status: 'passed', command: 'npm run test:e2e' },
		publishable: unreviewed.length === 0,
		environment: environmentMetadata(),
		harness: {
			commit: git('rev-parse', 'HEAD'),
			workingTreeDirty: git('status', '--porcelain').length > 0,
			sampleCount,
			cpuThrottleRates: throttleRates,
			cache: 'disabled',
			network: 'local-loopback-unthrottled'
		},
		profiles,
		limitations: [
			'Chrome tracing adds observer overhead and trace categories may contain nested durations.',
			'Parse, compile, and evaluation totals must be interpreted independently rather than summed.',
			'CPU throttling is Chromium emulation on the recorded desktop CPU, not physical mobile hardware.',
			'URL attribution identifies emitted chunks; source-map attribution within a chunk is not inferred.',
			'Every sample uses a fresh browser context with the HTTP cache disabled.'
		]
	};
	const output = outputPath();
	await mkdir(resolve(output, '..'), { recursive: true });
	await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
	console.log(`Startup CPU profile written to ${relative(repositoryRoot, output)}`);
} finally {
	await browser.close();
	await harness.close();
}

/** Captures one cache-cold navigation through the shared semantic readiness boundary. */
async function measureColdStartup(browserInstance, participant, throttleRate) {
	await resetService({});
	const context = await browserInstance.newContext();
	const page = await context.newPage();
	const session = await context.newCDPSession(page);
	let tracing = false;
	try {
		await session.send('Network.enable');
		await session.send('Network.setCacheDisabled', { cacheDisabled: true });
		await session.send('Performance.enable');
		await session.send('Profiler.enable');
		await session.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
		await session.send('Emulation.setCPUThrottlingRate', { rate: throttleRate });
		await session.send('Tracing.start', {
			categories: [
				'devtools.timeline',
				'v8',
				'disabled-by-default-v8.compile',
				'disabled-by-default-devtools.timeline'
			].join(','),
			options: 'record-as-much-as-possible',
			transferMode: 'ReturnAsStream'
		});
		tracing = true;

		await page.evaluate(() => console.timeStamp('__framework_comparison_navigation_start__'));
		await page.goto(`${participant.url}/incidents/inc-100`, { waitUntil: 'domcontentloaded' });
		await page.getByRole('heading', { name: 'Checkout authorization failures' }).waitFor();
		const firstContentfulPaintMs = await page.evaluate(waitForFirstContentfulPaint);
		await page.locator('.connection').getByText('Live service', { exact: true }).waitFor();
		await page.evaluate(() => console.timeStamp('__framework_comparison_ready__'));
		const readiness = await page.evaluate(() => ({
			readyMs: performance.now(),
			navigation: performance.getEntriesByType('navigation')[0]?.toJSON() ?? null,
			scripts: performance
				.getEntriesByType('resource')
				.filter((entry) => entry.initiatorType === 'script' || /\.m?js(?:$|\?)/.test(entry.name))
				.map((entry) => ({
					name: entry.name,
					transferSize: entry.transferSize,
					encodedBodySize: entry.encodedBodySize,
					decodedBodySize: entry.decodedBodySize,
					durationMs: entry.duration
				}))
		}));
		const performanceMetrics = metricRecord(await session.send('Performance.getMetrics'));
		const coverage = summarizeCoverage((await session.send('Profiler.takePreciseCoverage')).result);
		await session.send('Profiler.stopPreciseCoverage');
		const traceEvents = await finishTrace(session);
		tracing = false;
		return {
			firstContentfulPaintMs,
			readyMs: readiness.readyMs,
			navigation: readiness.navigation,
			scripts: readiness.scripts,
			performance: selectPerformanceMetrics(performanceMetrics),
			coverage,
			trace: analyzeStartupTrace(traceEvents)
		};
	} finally {
		if (tracing) await finishTrace(session).catch(() => undefined);
		await context.close();
	}
}

/** Ends tracing and drains Chromium's result stream before the owning context closes. */
async function finishTrace(session) {
	const completed = new Promise((resolveComplete) =>
		session.once('Tracing.tracingComplete', resolveComplete)
	);
	await session.send('Tracing.end');
	const { stream } = await completed;
	if (!stream) throw new Error('Chromium did not return a startup trace stream');
	let json = '';
	for (;;) {
		const chunk = await session.send('IO.read', { handle: stream });
		json += chunk.data;
		if (chunk.eof) break;
	}
	await session.send('IO.close', { handle: stream });
	return JSON.parse(json).traceEvents ?? [];
}

/** Reduces precise coverage to per-URL code extent and invoked-function counts. */
function summarizeCoverage(scripts) {
	return scripts
		.filter((script) => /^https?:/.test(script.url))
		.map((script) => ({
			url: script.url,
			codeBytes: Math.max(
				0,
				...script.functions.flatMap((entry) => entry.ranges.map((range) => range.endOffset))
			),
			functionCount: script.functions.length,
			invokedFunctionCount: script.functions.filter((entry) =>
				entry.ranges.some((range) => range.count > 0)
			).length
		}))
		.sort((left, right) => right.codeBytes - left.codeBytes);
}

function metricRecord(response) {
	return Object.fromEntries(response.metrics.map((metric) => [metric.name, metric.value]));
}

function selectPerformanceMetrics(metrics) {
	const milliseconds = (name) => (Number.isFinite(metrics[name]) ? metrics[name] * 1_000 : null);
	return {
		scriptDurationMs: milliseconds('ScriptDuration'),
		taskDurationMs: milliseconds('TaskDuration'),
		v8CompileDurationMs: milliseconds('V8CompileDuration'),
		layoutDurationMs: milliseconds('LayoutDuration'),
		recalcStyleDurationMs: milliseconds('RecalcStyleDuration')
	};
}

function summarizeSamples(samples) {
	const metric = (read) => {
		const values = samples.map(read).filter(Number.isFinite);
		return {
			p50: startupPercentile(values, 0.5),
			p90: startupPercentile(values, 0.9),
			p95: startupPercentile(values, 0.95),
			p99: startupPercentile(values, 0.99),
			max: startupPercentile(values, 1)
		};
	};
	return {
		firstContentfulPaintMs: metric((sample) => sample.firstContentfulPaintMs),
		readyMs: metric((sample) => sample.readyMs),
		scriptDurationMs: metric((sample) => sample.performance.scriptDurationMs),
		v8CompileDurationMs: metric((sample) => sample.performance.v8CompileDurationMs),
		parseTraceMs: metric((sample) => sample.trace.totals.parseMs),
		compileTraceMs: metric((sample) => sample.trace.totals.compileMs),
		evaluationTraceMs: metric((sample) => sample.trace.totals.evaluationMs),
		parseBeforeFcpMs: metric((sample) => sample.trace.beforeFcp.parseMs),
		compileBeforeFcpMs: metric((sample) => sample.trace.beforeFcp.compileMs),
		evaluationBeforeFcpMs: metric((sample) => sample.trace.beforeFcp.evaluationMs),
		decodedScriptBytes: metric((sample) =>
			sample.scripts.reduce((sum, script) => sum + script.decodedBodySize, 0)
		),
		profiledCodeBytes: metric((sample) =>
			sample.coverage.reduce((sum, script) => sum + script.codeBytes, 0)
		),
		profiledFunctionCount: metric((sample) =>
			sample.coverage.reduce((sum, script) => sum + script.functionCount, 0)
		),
		invokedFunctionCount: metric((sample) =>
			sample.coverage.reduce((sum, script) => sum + script.invokedFunctionCount, 0)
		),
		traceMarkerCoverage: Object.fromEntries(
			['navigationStartFound', 'firstContentfulPaintFound', 'readyFound'].map((marker) => [
				marker,
				samples.filter((sample) => sample.trace.markers[marker]).length
			])
		)
	};
}

function waitForFirstContentfulPaint() {
	const read = () => performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
	const existing = read();
	if (existing !== undefined) return Promise.resolve(existing);
	return new Promise((resolvePaint, rejectPaint) => {
		const observer = new PerformanceObserver(() => {
			const value = read();
			if (value === undefined) return;
			clearTimeout(timeout);
			observer.disconnect();
			resolvePaint(value);
		});
		const timeout = setTimeout(() => {
			observer.disconnect();
			rejectPaint(new Error('First contentful paint was not observed within 2 seconds'));
		}, 2_000);
		observer.observe({ type: 'paint', buffered: true });
	});
}

async function resetService(body) {
	const response = await fetch('http://127.0.0.1:4310/__benchmark/reset', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-benchmark-control': 'fixture-reset' },
		body: JSON.stringify(body)
	});
	if (!response.ok) throw new Error(`Fixture reset failed with ${response.status}`);
}

function positiveInteger(value, fallback) {
	const parsed = Number(value ?? fallback);
	if (!Number.isSafeInteger(parsed) || parsed < 1)
		throw new TypeError('Sample count must be positive');
	return parsed;
}

function throttleRateList(value) {
	const rates = value.split(',').map(Number);
	if (!rates.length || rates.some((rate) => !Number.isFinite(rate) || rate < 1))
		throw new TypeError('CPU throttle rates must be comma-separated numbers of at least one');
	return [...new Set(rates)];
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
	return resolve(repositoryRoot, '.tmp', 'framework-comparison', `startup-cpu-${Date.now()}.json`);
}
