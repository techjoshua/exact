import { execFileSync } from 'node:child_process';
import { cpus, platform, release, totalmem } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { chromium } from 'playwright';
import { analyzeStartupTrace } from './startup-cpu-analysis.mjs';
import { measureRetainedMemory } from './browser-memory.mjs';
import { installBrowserVitals, readBrowserVitals } from './browser-vitals.mjs';
import { captureClientProfile } from './client-profiling.mjs';
import { preciseExecutedBytes } from './precise-coverage.mjs';
import { summarizeSampleMetric } from './percentile-summary.mjs';
import { hashArtifactDirectory, hashSemanticResponse } from './artifact-integrity.mjs';
import { attributeClientModules } from './module-attribution.mjs';
import { balancedRoundOrder } from './balanced-round-order.mjs';

if (!process.argv.includes('--correctness-passed')) {
	throw new Error(
		'Run `npm run measure:startup-cpu` so the shared correctness suite gates CPU profiling.'
	);
}

const suiteRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(suiteRoot, '..');
const sampleCount = positiveInteger(process.env.COMPARISON_STARTUP_SAMPLES, 10);
const throttleRates = throttleRateList(process.env.COMPARISON_CPU_RATES ?? '1,4,6');
const attributionEnabled = process.env.COMPARISON_STARTUP_ATTRIBUTION === '1';
const measurementRound = nonNegativeInteger(process.env.COMPARISON_MEASUREMENT_ROUND, 0);
const participants = [
	{ id: 'exact-controlled', directory: 'exact', artifact: 'dist', url: 'http://127.0.0.1:4401' },
	{ id: 'react-controlled', directory: 'react', artifact: 'dist', url: 'http://127.0.0.1:4402' },
	{
		id: 'sveltekit-controlled',
		directory: 'sveltekit',
		artifact: 'build/client',
		url: 'http://127.0.0.1:4403'
	},
	{
		id: 'nuxt-controlled',
		directory: 'nuxt',
		artifact: '.output/public',
		url: 'http://127.0.0.1:4404'
	},
	{
		id: 'tanstack-start-controlled',
		directory: 'tanstack-start',
		artifact: '.output/public',
		url: 'http://127.0.0.1:4405'
	}
];

const artifacts = Object.fromEntries(
	await Promise.all(
		participants.map(async (participant) => [
			participant.id,
			await hashArtifactDirectory(
				resolve(suiteRoot, 'participants', participant.directory, participant.artifact)
			)
		])
	)
);

const harness = await import('./e2e-server.mjs');
const browser = await chromium.launch();

try {
	const profiles = {};
	const sampleOrders = {};
	for (const rate of throttleRates) {
		const samples = Object.fromEntries(participants.map((participant) => [participant.id, []]));
		const orders = [];
		for (let index = 0; index < sampleCount; index++) {
			const order = balancedRoundOrder(participants, index, measurementRound + rate);
			orders.push(order.map((participant) => participant.id));
			for (const participant of order) {
				console.log(
					`Profiling ${participant.id} at ${rate}x CPU sample ${index + 1}/${sampleCount}`
				);
				samples[participant.id].push(await measureColdStartup(browser, participant, rate));
			}
		}
		const rateResults = {};
		for (const participant of participants) {
			const participantSamples = samples[participant.id];
			const responseHashes = new Set(participantSamples.map((sample) => sample.responseHash));
			if (responseHashes.size !== 1)
				throw new Error(`${participant.id} produced unstable startup responses at ${rate}x`);
			rateResults[participant.id] = {
				samples: participantSamples,
				response: { hash: participantSamples[0].responseHash, stable: true },
				summary: summarizeSamples(participantSamples)
			};
		}
		if (new Set(Object.values(rateResults).map((entry) => entry.response.hash)).size !== 1)
			throw new Error(`Controlled participants produced different startup responses at ${rate}x`);
		profiles[`${rate}x`] = rateResults;
		sampleOrders[`${rate}x`] = orders;
	}
	const output = outputPath();
	const timedCheckpoint = `${output}.timed.json`;
	await mkdir(resolve(output, '..'), { recursive: true });
	await writeFile(timedCheckpoint, `${JSON.stringify(createResult({}, false), null, 2)}\n`);
	console.log(`Timed startup checkpoint written to ${relative(repositoryRoot, timedCheckpoint)}`);
	const diagnostics = {};
	for (const participant of participants) {
		console.log(`Capturing untimed CPU and allocation profiles for ${participant.id}`);
		diagnostics[participant.id] = await captureClientProfile(browser, participant, resetService);
	}
	let attributionWarning;
	if (attributionEnabled) {
		try {
			diagnostics['exact-controlled'].startup.modules = await readExactModuleAttribution(
				diagnostics['exact-controlled'].startup.coverage,
				profiles['1x']['exact-controlled'].samples[0].trace.functionSites ?? []
			);
		} catch (error) {
			attributionWarning = `Exact module attribution unavailable: ${error instanceof Error ? error.message : String(error)}`;
			console.warn(attributionWarning);
		}
	}

	const result = createResult(diagnostics, true, attributionWarning);
	await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
	console.log(`Startup CPU profile written to ${relative(repositoryRoot, output)}`);

	function createResult(diagnosticProfiles, complete, warning) {
		return {
			schemaVersion: 1,
			kind: 'framework-comparison-startup-cpu-profile',
			createdAt: new Date().toISOString(),
			correctness: { status: 'passed', command: 'npm run test:e2e' },
			publishable: true,
			complete,
			environment: environmentMetadata(),
			harness: {
				commit: git('rev-parse', 'HEAD'),
				workingTreeDirty: git('status', '--porcelain').length > 0,
				sampleCount,
				cpuThrottleRates: throttleRates,
				measurementRound,
				sampleOrders,
				measurementTopology: 'balanced-round-interleaved',
				cache: 'disabled',
				network: 'local-loopback-unthrottled'
			},
			artifacts,
			profiles,
			diagnostics: diagnosticProfiles,
			limitations: [
				'Chrome tracing adds observer overhead and trace categories may contain nested durations.',
				'Parse, compile, and evaluation totals must be interpreted independently rather than summed.',
				'CPU throttling is Chromium emulation on the recorded desktop CPU, not physical mobile hardware.',
				'Untimed CPU and heap top sites retain emitted locations; attribution-enabled Exact runs additionally join precise coverage and trace function sites to the emitted source map.',
				'Best-effort coverage preserves normal V8 optimization but can omit functions collected before capture.',
				'Sampling heap profiles estimate allocation sites and do not represent exact byte accounting.',
				'Every sample uses a fresh browser context with the HTTP cache disabled.',
				'Every timed round measures one cold sample from each participant in balanced rotating order.',
				...(warning ? [warning] : [])
			]
		};
	}
} finally {
	await browser.close();
	await harness.close();
}

/** Joins the diagnostic Exact coverage and trace inventory to its emitted source map. */
async function readExactModuleAttribution(coverageScripts, functionSites) {
	const script = coverageScripts.find((entry) => /\/assets\/[^/]+\.js$/.test(entry.url));
	if (!script) throw new Error('Exact startup attribution omitted the production client script');
	const filename = pathBasename(new URL(script.url).pathname);
	const outputRoot = resolve(suiteRoot, 'participants', 'exact', 'dist', 'assets');
	const code = await readFile(resolve(outputRoot, filename), 'utf8');
	const sourceMap = JSON.parse(await readFile(resolve(outputRoot, `${filename}.map`), 'utf8'));
	const mapped = attributeClientModules({
		code,
		sourceMap,
		coverage: script,
		functionSites: functionSites.filter((site) => site.url === script.url)
	});
	const bundlerInventory = JSON.parse(
		await readFile(
			resolve(suiteRoot, 'participants', 'exact', 'dist', '.exact', 'module-attribution.json'),
			'utf8'
		)
	);
	const bundler = bundlerInventory.chunks.find((chunk) => chunk.fileName === `assets/${filename}`);
	return { mapped, bundler: bundler?.modules ?? [] };
}

function pathBasename(value) {
	return value.slice(value.lastIndexOf('/') + 1);
}

/** Captures one cache-cold navigation through the shared semantic readiness boundary. */
async function measureColdStartup(browserInstance, participant, throttleRate) {
	await resetService({});
	const context = await browserInstance.newContext();
	const page = await context.newPage();
	const session = await context.newCDPSession(page);
	let tracing = false;
	try {
		await page.addInitScript(installBrowserVitals);
		await session.send('Network.enable');
		await session.send('Network.setCacheDisabled', { cacheDisabled: true });
		await session.send('Performance.enable');
		await session.send('Profiler.enable');
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
		const vitals = await page.evaluate(readBrowserVitals);
		const semanticResponse = await page.evaluate(() => ({
			heading: document.querySelector('h1, h2')?.textContent?.trim() ?? null,
			connection: document.querySelector('.connection')?.textContent?.trim() ?? null
		}));
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
		const coverage = summarizeCoverage(
			(await session.send('Profiler.getBestEffortCoverage')).result
		);
		const traceEvents = await finishTrace(session);
		tracing = false;
		const memory = await measureRetainedMemory(session);
		return {
			firstContentfulPaintMs,
			vitals,
			readyMs: readiness.readyMs,
			navigation: readiness.navigation,
			scripts: readiness.scripts,
			performance: selectPerformanceMetrics(performanceMetrics),
			memory,
			coverage,
			trace: analyzeStartupTrace(traceEvents, {
				includeFunctionSites: attributionEnabled && participant.id === 'exact-controlled'
			}),
			responseHash: hashSemanticResponse(semanticResponse)
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
			executedBytes: preciseExecutedBytes(script.functions.flatMap((entry) => entry.ranges)),
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
	const metric = (read) => summarizeSampleMetric(samples, read);
	return {
		firstContentfulPaintMs: metric((sample) => sample.firstContentfulPaintMs),
		largestContentfulPaintMs: metric((sample) => sample.vitals.largestContentfulPaintMs),
		longTaskCount: metric((sample) => sample.vitals.longTaskCount),
		longTaskDurationMs: metric((sample) => sample.vitals.longTaskDurationMs),
		totalBlockingTimeMs: metric((sample) => sample.vitals.totalBlockingTimeMs),
		domElementCount: metric((sample) => sample.vitals.domElementCount),
		domNodeCount: metric((sample) => sample.vitals.domNodeCount),
		domCommentCount: metric((sample) => sample.vitals.domCommentCount),
		domTextCount: metric((sample) => sample.vitals.domTextCount),
		readyMs: metric((sample) => sample.readyMs),
		scriptDurationMs: metric((sample) => sample.performance.scriptDurationMs),
		taskDurationMs: metric((sample) => sample.performance.taskDurationMs),
		v8CompileDurationMs: metric((sample) => sample.performance.v8CompileDurationMs),
		layoutDurationMs: metric((sample) => sample.performance.layoutDurationMs),
		recalcStyleDurationMs: metric((sample) => sample.performance.recalcStyleDurationMs),
		jsHeapUsedBytes: metric((sample) => sample.memory.jsHeapUsedBytes),
		jsHeapTotalBytes: metric((sample) => sample.memory.jsHeapTotalBytes),
		embedderHeapUsedBytes: metric((sample) => sample.memory.embedderHeapUsedBytes),
		backingStorageBytes: metric((sample) => sample.memory.backingStorageBytes),
		documentCount: metric((sample) => sample.memory.documents),
		retainedNodeCount: metric((sample) => sample.memory.nodes),
		eventListenerCount: metric((sample) => sample.memory.eventListeners),
		parseTraceMs: metric((sample) => sample.trace.totals.parseMs),
		compileTraceMs: metric((sample) => sample.trace.totals.compileMs),
		evaluationTraceMs: metric((sample) => sample.trace.totals.evaluationMs),
		parseBeforeFcpMs: metric((sample) => sample.trace.beforeFcp.parseMs),
		compileBeforeFcpMs: metric((sample) => sample.trace.beforeFcp.compileMs),
		evaluationBeforeFcpMs: metric((sample) => sample.trace.beforeFcp.evaluationMs),
		parsedFunctionCount: metric((sample) => sample.trace.functionCounts.parsed),
		compiledFunctionCount: metric((sample) => sample.trace.functionCounts.compiled),
		parsedFunctionBeforeFcpCount: metric((sample) => sample.trace.functionCountsBeforeFcp.parsed),
		compiledFunctionBeforeFcpCount: metric(
			(sample) => sample.trace.functionCountsBeforeFcp.compiled
		),
		decodedScriptBytes: metric((sample) =>
			sample.scripts.reduce((sum, script) => sum + script.decodedBodySize, 0)
		),
		profiledCodeBytes: metric((sample) =>
			sample.coverage.reduce((sum, script) => sum + script.codeBytes, 0)
		),
		executedCodeBytes: metric((sample) =>
			sample.coverage.reduce((sum, script) => sum + script.executedBytes, 0)
		),
		profiledFunctionCount: metric((sample) =>
			sample.coverage.reduce((sum, script) => sum + script.functionCount, 0)
		),
		invokedFunctionCount: metric((sample) =>
			sample.coverage.reduce((sum, script) => sum + script.invokedFunctionCount, 0)
		),
		traceMarkerCoverage: metric(
			(sample) =>
				Number(sample.trace.markers.navigationStartFound) +
				Number(sample.trace.markers.firstContentfulPaintFound) +
				Number(sample.trace.markers.readyFound)
		),
		traceMarkerCounts: Object.fromEntries(
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

function nonNegativeInteger(value, fallback) {
	const parsed = Number(value ?? fallback);
	if (!Number.isSafeInteger(parsed) || parsed < 0)
		throw new TypeError('Measurement round must be a non-negative integer');
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

function outputPath() {
	const option = process.argv.find((argument) => argument.startsWith('--output='));
	if (option) return resolve(repositoryRoot, option.slice('--output='.length));
	return resolve(repositoryRoot, '.tmp', 'framework-comparison', `startup-cpu-${Date.now()}.json`);
}
