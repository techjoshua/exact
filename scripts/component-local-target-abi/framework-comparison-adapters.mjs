import {
	createDeterministicSuite,
	createSuite,
	completeSampleSummaries,
	sum,
	validateRaw,
	withSourcePublication
} from './framework-comparison-adapter-support.mjs';

export { adaptFrameworkComparisonSsr } from './framework-comparison-ssr-adapter.mjs';

const browserMetrics = Object.freeze({
	navigationMs: (sample) => sample.navigation.durationMs,
	domContentLoadedMs: (sample) => sample.navigation.domContentLoadedMs,
	loadEventMs: (sample) => sample.navigation.loadEventMs,
	transferredScriptBytes: (sample) => sample.navigation.transferredScriptBytes,
	firstContentfulPaintMs: (sample) => sample.navigation.firstContentfulPaintMs,
	largestContentfulPaintMs: (sample) => sample.vitals.largestContentfulPaintMs,
	totalBlockingTimeMs: (sample) => sample.vitals.totalBlockingTimeMs,
	longTaskCount: (sample) => sample.vitals.longTaskCount,
	longTaskDurationMs: (sample) => sample.vitals.longTaskDurationMs,
	domElementCount: (sample) => sample.vitals.domElementCount,
	domNodeCount: (sample) => sample.vitals.domNodeCount,
	domCommentCount: (sample) => sample.vitals.domCommentCount,
	domTextCount: (sample) => sample.vitals.domTextCount,
	heapBytes: (sample) => sample.heapBytes,
	jsHeapTotalBytes: (sample) => sample.memory.jsHeapTotalBytes,
	embedderHeapUsedBytes: (sample) => sample.memory.embedderHeapUsedBytes,
	backingStorageBytes: (sample) => sample.memory.backingStorageBytes,
	documentCount: (sample) => sample.memory.documents,
	retainedNodeCount: (sample) => sample.memory.nodes,
	eventListenerCount: (sample) => sample.memory.eventListeners,
	optimisticFeedbackMs: (sample) => sample.optimisticFeedbackMs,
	settlementMs: (sample) => sample.settlementMs,
	requestDispatchedMs: (sample) => sample.phasesMs['request-dispatched'],
	sseIncidentReceivedMs: (sample) => sample.phasesMs['sse-incident-received'],
	httpHeadersReceivedMs: (sample) => sample.phasesMs['http-headers-received'],
	httpJsonDecodedMs: (sample) => sample.phasesMs['http-json-decoded']
});

const startupMetrics = Object.freeze({
	firstContentfulPaintMs: (sample) => sample.firstContentfulPaintMs,
	largestContentfulPaintMs: (sample) => sample.vitals.largestContentfulPaintMs,
	longTaskCount: (sample) => sample.vitals.longTaskCount,
	longTaskDurationMs: (sample) => sample.vitals.longTaskDurationMs,
	totalBlockingTimeMs: (sample) => sample.vitals.totalBlockingTimeMs,
	domElementCount: (sample) => sample.vitals.domElementCount,
	domNodeCount: (sample) => sample.vitals.domNodeCount,
	domCommentCount: (sample) => sample.vitals.domCommentCount,
	domTextCount: (sample) => sample.vitals.domTextCount,
	readyMs: (sample) => sample.readyMs,
	scriptDurationMs: (sample) => sample.performance.scriptDurationMs,
	taskDurationMs: (sample) => sample.performance.taskDurationMs,
	v8CompileDurationMs: (sample) => sample.performance.v8CompileDurationMs,
	layoutDurationMs: (sample) => sample.performance.layoutDurationMs,
	recalcStyleDurationMs: (sample) => sample.performance.recalcStyleDurationMs,
	jsHeapUsedBytes: (sample) => sample.memory.jsHeapUsedBytes,
	jsHeapTotalBytes: (sample) => sample.memory.jsHeapTotalBytes,
	embedderHeapUsedBytes: (sample) => sample.memory.embedderHeapUsedBytes,
	backingStorageBytes: (sample) => sample.memory.backingStorageBytes,
	documentCount: (sample) => sample.memory.documents,
	retainedNodeCount: (sample) => sample.memory.nodes,
	eventListenerCount: (sample) => sample.memory.eventListeners,
	parseTraceMs: (sample) => sample.trace.totals.parseMs,
	compileTraceMs: (sample) => sample.trace.totals.compileMs,
	evaluationTraceMs: (sample) => sample.trace.totals.evaluationMs,
	parseBeforeFcpMs: (sample) => sample.trace.beforeFcp.parseMs,
	compileBeforeFcpMs: (sample) => sample.trace.beforeFcp.compileMs,
	evaluationBeforeFcpMs: (sample) => sample.trace.beforeFcp.evaluationMs,
	parsedFunctionCount: (sample) => sample.trace.functionCounts.parsed,
	compiledFunctionCount: (sample) => sample.trace.functionCounts.compiled,
	parsedFunctionBeforeFcpCount: (sample) => sample.trace.functionCountsBeforeFcp.parsed,
	compiledFunctionBeforeFcpCount: (sample) => sample.trace.functionCountsBeforeFcp.compiled,
	decodedScriptBytes: (sample) => sum(sample.scripts, (entry) => entry.decodedBodySize),
	profiledCodeBytes: (sample) => sum(sample.coverage, (entry) => entry.codeBytes),
	executedCodeBytes: (sample) => sum(sample.coverage, (entry) => entry.executedBytes),
	profiledFunctionCount: (sample) => sum(sample.coverage, (entry) => entry.functionCount),
	invokedFunctionCount: (sample) => sum(sample.coverage, (entry) => entry.invokedFunctionCount),
	traceMarkerCoverage: (sample) =>
		Number(sample.trace.markers?.navigationStartFound) +
		Number(sample.trace.markers?.firstContentfulPaintFound) +
		Number(sample.trace.markers?.readyFound)
});

/** Adapts the controlled browser raw result without discarding any sampled browser metric. */
export function adaptFrameworkComparisonBrowser(raw) {
	validateRaw(raw, 'framework-comparison-raw-run');
	const artifactByParticipant = new Map(
		(raw.complexity ?? []).map((entry) => [entry.participantId, entry.artifacts?.hash])
	);
	return withSourcePublication(
		createSuite({
			name: 'framework-comparison-browser',
			entries: completeSampleSummaries(raw.browser, browserMetrics),
			metrics: browserMetrics,
			sampleCount: raw.harness?.sampleCount,
			warmupCount: raw.harness?.browserWarmupCount,
			artifactHash: (name) => artifactByParticipant.get(name),
			responseHash: (_name, entry) => entry.response?.hash
		}),
		raw
	);
}

/** Adapts browser, one-shot clean-build, and deterministic complexity lanes from one raw run. */
export function adaptFrameworkComparisonBrowserRun(raw) {
	const browser = adaptFrameworkComparisonBrowser(raw);
	const responseHashes = Object.fromEntries(
		Object.entries(raw.browser).map(([name, entry]) => [name, entry.response?.hash])
	);
	const complexityByName = new Map(
		(raw.complexity ?? []).map((entry) => [entry.participantId, entry])
	);
	const artifactHashes = Object.fromEntries(
		[...complexityByName].map(([name, entry]) => [name, entry.artifacts?.hash])
	);
	const build = createDeterministicSuite({
		name: 'framework-comparison-clean-build',
		entries: raw.build,
		values: (entry) => ({ cleanBuildMs: entry.cleanBuildMs }),
		artifactHashes,
		responseHashes
	});
	const complexity = createDeterministicSuite({
		name: 'framework-comparison-complexity',
		entries: Object.fromEntries(complexityByName),
		values: (entry) => ({
			authoredProductionLines: entry.authoredProductionLines,
			authoredTestLines: entry.authoredTestLines,
			sourceFiles: entry.sourceFiles,
			manualTransportSites: entry.manualTransportSites,
			synchronizationSites: entry.synchronizationSites,
			artifactRawBytes: entry.artifacts.rawBytes,
			artifactGzipBytes: entry.artifacts.gzipBytes,
			artifactBrotliBytes: entry.artifacts.brotliBytes,
			artifactFiles: entry.artifacts.files
		}),
		artifactHashes,
		responseHashes
	});
	return Object.freeze([
		browser,
		withSourcePublication(build, raw),
		withSourcePublication(complexity, raw)
	]);
}

/** Adapts each CPU throttle profile as a distinct, population-consistent checkpoint suite. */
export function adaptFrameworkComparisonStartupCpu(raw) {
	validateRaw(raw, 'framework-comparison-startup-cpu-profile');
	return Object.freeze(
		Object.entries(raw.profiles).map(([rate, entries]) =>
			withSourcePublication(
				createSuite({
					name: `framework-comparison-startup-${rate}`,
					entries: completeSampleSummaries(entries, startupMetrics),
					metrics: startupMetrics,
					sampleCount: raw.harness?.sampleCount,
					warmupCount: 0,
					artifactHash: (name) => raw.artifacts?.[name],
					responseHash: (_name, entry) => entry.response?.hash
				}),
				raw
			)
		)
	);
}
