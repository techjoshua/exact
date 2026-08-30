import { createHash } from 'node:crypto';

/** Converts every captured internal benchmark marker into exact-only checkpoint suites. */
export function adaptComponentLocalTargetAbiInternalPerformance(markers) {
	const suites = [];
	suites.push(...adaptReactive(markers.REACTIVE_BENCHMARK_JSON));
	suites.push(adaptDomList(markers.DOM_LIST_BENCHMARK_JSON));
	suites.push(...adaptFramework(markers.EXACT_FRAMEWORK_BENCHMARK_JSON));
	suites.push(adaptCompiler(markers.COMPILER_BENCHMARK_JSON));
	suites.push(...adaptTheme(markers.THEME_BENCHMARK_JSON));
	suites.push(adaptDevtools(markers.DEVTOOLS_BENCHMARK_JSON));
	suites.push(adaptReactCompatibility(markers.REACT_COMPAT_BENCHMARK_JSON));
	return Object.freeze(suites);
}

function adaptReactive(raw) {
	if (!Array.isArray(raw?.results) || raw.results.length === 0)
		throw new Error('reactive benchmark omitted results');
	return raw.results.map((result) => {
		const metrics = {
			durationMs: {
				unit: 'ms',
				summary: {
					p50: result.medianMs,
					p75: result.p75Ms,
					p95: result.p95Ms,
					p99: result.p99Ms
				},
				samples: result.rawTimingsMs,
				warmups: raw.environment?.warmups
			}
		};
		if (result.rawByteSamples)
			metrics.protocolBytes = sampledMetric(
				'bytes',
				result.rawByteSamples,
				raw.environment?.warmups
			);
		return exactOnlySuite(`internal-reactive-${slug(result.name)}`, metrics, raw);
	});
}

function adaptDomList(raw) {
	const summary = raw?.summary;
	if (!summary || !Array.isArray(raw.rawSamples))
		throw new Error('DOM-list benchmark omitted samples');
	const metrics = {
		moduleEvaluationMs: summaryMetric(
			'ms',
			summary.moduleEvaluationMs,
			raw.rawSamples.map((sample) => sample.moduleEvaluationMs)
		)
	};
	for (const [name, value] of Object.entries(summary.metrics))
		metrics[name] = summaryMetric(
			summary.units[name],
			value,
			raw.rawSamples.map((sample) => sample.metrics[name])
		);
	return exactOnlySuite('internal-dom-list', metrics, raw);
}

function adaptFramework(raw) {
	if (!raw?.complete || !Array.isArray(raw.raw?.build) || !Array.isArray(raw.raw?.node))
		throw new Error('framework benchmark omitted complete raw results');
	const suites = [];
	const buildMetrics = {
		buildElapsedMs: summaryMetric(
			'ms',
			raw.fixtureBuild.elapsedMs,
			raw.raw.build.map((sample) => sample.elapsedMs)
		)
	};
	for (const target of Object.keys(raw.fixtureBuild.bytes)) {
		for (const encoding of ['raw', 'gzip', 'brotli']) {
			const name = `${target}${capitalize(encoding)}Bytes`;
			buildMetrics[name] = sampledMetric(
				'bytes',
				raw.raw.build.map((sample) => sample.bytes[target][encoding]),
				0
			);
		}
	}
	suites.push(exactOnlySuite('internal-framework-build', buildMetrics, raw));
	const nodeSummary = new Map(raw.node.map((entry) => [entry.scenario, entry]));
	for (const rawScenario of raw.raw.node) {
		const summary = nodeSummary.get(rawScenario.scenario);
		if (!summary) throw new Error(`framework benchmark omitted ${rawScenario.scenario} summary`);
		suites.push(
			exactOnlySuite(
				`internal-framework-node-${slug(rawScenario.scenario)}`,
				adaptScenario(summary, rawScenario.samples),
				raw
			)
		);
	}
	if (!Array.isArray(raw.chromium?.rawSamples))
		throw new Error('framework benchmark omitted raw Chromium samples');
	const chromiumSummary = new Map(raw.chromium.results.map((entry) => [entry.scenario, entry]));
	for (const scenario of chromiumSummary.keys()) {
		const samples = raw.chromium.rawSamples.map((sample) => ({
			scenario,
			moduleEvaluationMs: sample.evaluationMs,
			...sample.results[scenario]
		}));
		suites.push(
			exactOnlySuite(
				`internal-framework-chromium-${slug(scenario)}`,
				adaptScenario(chromiumSummary.get(scenario), samples),
				raw
			)
		);
	}
	return suites;
}

function adaptScenario(summary, samples) {
	const metrics = {
		moduleEvaluationMs: summaryMetric(
			'ms',
			summary.moduleEvaluationMs,
			samples.map((sample) => sample.moduleEvaluationMs)
		)
	};
	for (const [name, value] of Object.entries(summary.metrics))
		metrics[name] = summaryMetric(
			summary.units[name],
			value,
			samples.map((sample) => sample.metrics?.[name] ?? sample[name])
		);
	return metrics;
}

function adaptCompiler(raw) {
	if (!raw?.semantic?.rawTimingsMs || !raw?.syntax?.rawTimingsMs)
		throw new Error('compiler benchmark omitted raw timings');
	return exactOnlySuite(
		'internal-compiler-workflow',
		{
			semanticValidationMs: recordedMetric('ms', raw.semantic, raw.semantic.rawTimingsMs),
			syntaxValidationMs: recordedMetric('ms', raw.syntax, raw.syntax.rawTimingsMs),
			semanticRebuilds: sampledMetric('count', [raw.semantic.rebuilds], 0),
			syntaxRebuilds: sampledMetric('count', [raw.syntax.rebuilds], 0),
			semanticDiagnosticPasses: sampledMetric('count', [raw.semantic.semanticDiagnostics], 0),
			syntaxDiagnosticPasses: sampledMetric('count', [raw.syntax.semanticDiagnostics], 0)
		},
		raw
	);
}

function adaptTheme(raw) {
	if (!Array.isArray(raw?.checks) || raw.checks.length === 0)
		throw new Error('theme benchmark omitted checks');
	return raw.checks.map((check) =>
		exactOnlySuite(
			`internal-theme-${slug(check.name)}`,
			{
				durationMs: sampledMetric('ms', check.samplesMs, 0),
				budgetMs: sampledMetric('ms', [check.budget], 0)
			},
			raw
		)
	);
}

function adaptDevtools(raw) {
	if (!raw?.measurements || !raw.budgets)
		throw new Error('DevTools benchmark omitted measurements');
	const metrics = {};
	for (const [name, value] of Object.entries(raw.measurements)) {
		metrics[name] = sampledMetric('ms', [value], 0);
		metrics[`${name}Budget`] = sampledMetric('ms', [raw.budgets[name]], 0);
	}
	return exactOnlySuite('internal-devtools', metrics, raw);
}

function adaptReactCompatibility(raw) {
	if (!Array.isArray(raw?.results) || raw.results.length === 0)
		throw new Error('React compatibility benchmark omitted results');
	const metrics = {};
	for (const result of raw.results) {
		const prefix = `react${slug(result.baseline)}`;
		metrics[`${prefix}DurationMs`] = {
			unit: 'ms',
			summary: {
				p50: result.p50Ms,
				p75: result.p75Ms,
				p95: result.p95Ms,
				p99: result.p99Ms
			},
			samples: result.rawSamples.map((sample) => sample.durationMs),
			warmups: 0
		};
		metrics[`${prefix}RenderedBytes`] = sampledMetric(
			'bytes',
			result.rawSamples.map((sample) => sample.bytes),
			0
		);
	}
	return exactOnlySuite('internal-react-compatibility-reference', metrics, raw);
}

function exactOnlySuite(name, metrics, rawArtifact) {
	const summaries = {};
	const populations = [];
	for (const [metricName, metric] of Object.entries(metrics)) {
		if (!Array.isArray(metric.samples) || metric.samples.length === 0)
			throw new Error(`${name} ${metricName} omitted raw samples`);
		if (metric.samples.some((value) => !Number.isFinite(value)))
			throw new Error(`${name} ${metricName} contains a non-finite sample`);
		for (const percentile of ['p50', 'p75', 'p95', 'p99']) {
			if (!Number.isFinite(metric.summary?.[percentile]))
				throw new Error(`${name} ${metricName} omitted ${percentile}`);
		}
		summaries[metricName] = { unit: metric.unit, ...metric.summary };
		populations.push({
			name: `${metricName} observations`,
			kind: 'samples',
			metrics: [metricName],
			sampleCount: metric.samples.length,
			warmupCount: metric.warmups ?? 0,
			rawSamples: [
				{
					name: 'exact',
					samples: metric.samples.map((value) => ({ [metricName]: value }))
				}
			]
		});
	}
	return Object.freeze({
		table: {
			suite: name,
			mode: 'exact-only',
			participants: [{ name: 'exact', metrics: summaries }]
		},
		populations,
		artifactHashes: { capturedBenchmarkInput: hashJson(rawArtifact) },
		responseHashes: {},
		responseIdentity: {
			status: 'inapplicable',
			reason:
				'This internal benchmark lane produces measurements or counter-metrics, not a rendered response'
		}
	});
}

function summaryMetric(unit, summary, samples) {
	return {
		unit,
		summary: {
			p50: summary.p50,
			p75: summary.p75,
			p95: summary.p95,
			p99: summary.p99
		},
		samples,
		warmups: 0
	};
}

function recordedMetric(unit, summary, samples) {
	return {
		unit,
		summary: { p50: summary.p50, p75: summary.p75, p95: summary.p95, p99: summary.p99 },
		samples,
		warmups: 0
	};
}

function sampledMetric(unit, samples, warmups) {
	const sorted = [...samples].sort((left, right) => left - right);
	return {
		unit,
		summary: {
			p50: percentile(sorted, 0.5),
			p75: percentile(sorted, 0.75),
			p95: percentile(sorted, 0.95),
			p99: percentile(sorted, 0.99)
		},
		samples,
		warmups
	};
}

function percentile(sorted, fraction) {
	return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function hashJson(value) {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function slug(value) {
	return String(value)
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, '-')
		.replaceAll(/^-|-$/g, '');
}

function capitalize(value) {
	return `${value[0].toUpperCase()}${value.slice(1)}`;
}
