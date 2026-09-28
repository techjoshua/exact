import { startupInteractionPhases } from './startup-interactions.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { summarizePercentiles } from './percentile-summary.mjs';
import { adaptFrameworkComparisonBrowser } from '../../scripts/component-local-target-abi/framework-comparison-adapters.mjs';

const metrics = {
	'Largest contentful paint': ['largestContentfulPaintMs', 1],
	'Browser interaction latency': ['interactionDurationMs', 1],
	'Service connection readiness': ['serviceReadyMs', 1],
	'Startup layout shift': ['cumulativeLayoutShift', 1],
	'Startup script CPU': ['startupScriptMs', 1],
	'Startup long-task blocking': ['totalBlockingTimeMs', 1],
	'Client script payload': ['transferredScriptBytes', 0.001],
	'Navigation completion': ['navigationMs', 1],
	'First contentful paint': ['firstContentfulPaintMs', 1],
	'Optimistic feedback': ['optimisticFeedbackMs', 1],
	'Authoritative settlement': ['settlementMs', 1],
	'Warm browser used heap': ['heapBytes', 1e-6]
};
const names = ['exact', 'react', 'sveltekit', 'nuxt', 'tanstack-start'];

/** Refreshes only browser charts from complete replay evidence. Server captures retain their dates. */
export function refreshClientReport(previous, raw) {
	const admitted = adaptFrameworkComparisonBrowser(raw);
	if (raw.publishable !== true) throw new Error('Non-publishable browser evidence');
	const summaries = Object.fromEntries(
		admitted.populations[0].rawSamples.map(({ name, samples }) => [
			name,
			Object.fromEntries(
				Object.keys(samples[0]).map((metric) => [
					metric,
					summarizePercentiles(samples.map((sample) => sample[metric]))
				])
			)
		])
	);
	const delivery = raw.harness.clientDelivery;
	if (
		delivery?.mode !== 'replay' ||
		delivery.frameworkServersStopped !== true ||
		delivery.cache !== 'disabled' ||
		delivery.captures?.length !== names.length ||
		raw.harness.sampleCount < 30 ||
		raw.harness.sampleCount % names.length !== 0
	)
		throw new Error(
			'Publication requires at least 30 balanced replay rounds for all five participants'
		);
	const participantIds = names.map((name) => `${name}-controlled`);
	for (const id of participantIds) {
		const capture = delivery.captures.find((entry) => entry.id === id);
		if (
			capture?.documentRequests !==
				raw.harness.sampleCount +
					raw.harness.browserWarmupCount +
					(raw.harness.browserExperienceVersion === 1
						? raw.startupInteractions?.rounds * startupInteractionPhases.length
						: 0) ||
			!capture.resources.some(
				(entry) => entry.path === delivery.documentPath && /^[a-f0-9]{64}$/.test(entry.sha256)
			)
		)
			throw new Error(`${id}: incomplete replay accounting`);
	}
	if (raw.harness.sampleOrders.length !== raw.harness.sampleCount)
		throw new Error('Missing interleaved sample orders');
	for (const order of raw.harness.sampleOrders)
		if (JSON.stringify([...order].sort()) !== JSON.stringify([...participantIds].sort()))
			throw new Error('Unbalanced replay participant order');
	for (const id of participantIds)
		for (let position = 0; position < names.length; position++)
			if (
				raw.harness.sampleOrders.filter((order) => order[position] === id).length !==
				raw.harness.sampleCount / names.length
			)
				throw new Error('Unbalanced replay positions');
	const titles = [
		'First contentful paint',
		'Largest contentful paint',
		'Browser interaction latency',
		'Optimistic feedback',
		'Authoritative settlement',
		'Service connection readiness',
		'Startup layout shift',
		'Warm browser used heap',
		'Startup script CPU',
		'Startup long-task blocking',
		'Client script payload',
		'Navigation completion'
	];
	const templates =
		raw.harness.browserExperienceVersion === 1
			? titles.map((title) => ({
					title,
					unit:
						title === 'Startup layout shift'
							? 'score'
							: title === 'Warm browser used heap'
								? 'MB'
								: title === 'Client script payload'
									? 'kB'
									: 'ms',
					precision: title === 'Startup layout shift' ? 6 : 2,
					series: ['Exact', 'React', 'SvelteKit', 'Nuxt', 'TanStack Start'].map((name) => ({
						name
					}))
				}))
			: previous.browserCharts;
	const browserCharts = templates.map((chart) => {
		const [metric, scale] = metrics[chart.title] ?? [];
		if (!metric) throw new Error(`Unsupported browser chart: ${chart.title}`);
		return {
			...chart,
			comment: `${chart.title === 'Navigation completion' ? "Time until the browser's load event. " : ''}Captured production HTML and assets served by the common HTTP replay server. Fresh cache-disabled contexts in a warm browser process. ${chart.title === 'Warm browser used heap' ? 'Post-interaction, post-GC retained JavaScript heap, including V8 code and metadata.' : 'Lower is better.'}`,
			series: chart.series.map((series) => ({
				...series,
				stats: Object.fromEntries(
					Object.entries(
						summaries[`${series.name.toLowerCase().replaceAll(' ', '-')}-controlled`][metric]
					).map(([key, value]) => [key, value * scale])
				)
			}))
		};
	});
	const exact = summaries['exact-controlled'];
	return {
		...previous,
		metadata: {
			...previous.metadata,
			browserCreatedAt: raw.createdAt,
			browserSamples: raw.harness.sampleCount,
			browserMethod: 'captured-production-http-replay',
			browserDelivery: delivery,
			browserEnvironment: raw.environment,
			browserCommit: raw.harness.commit
		},
		summary: previous.summary.map((entry) =>
			entry.label === 'Optimistic mean'
				? { ...entry, value: `${exact.optimisticFeedbackMs.mean.toFixed(2)} ms` }
				: entry.label === 'Warm browser heap'
					? {
							...entry,
							value: `${(exact.heapBytes.mean / 1e6).toFixed(2)} MB`,
							context: 'replay, post-interaction, post-GC'
						}
					: entry
		),
		...(raw.harness.browserExperienceVersion === 1
			? {
					startupInteractions: summarizeStartupInteractions(raw.startupInteractions, participantIds)
				}
			: {}),
		browserCharts
	};
}

/** Validates complete startup probes and keeps failed clicks visible beside successful attempts. */
export function summarizeStartupInteractions(probes, ids) {
	if (
		!Number.isSafeInteger(probes?.rounds) ||
		probes.rounds < 1 ||
		!Number.isFinite(probes.timeoutMs) ||
		probes.timeoutMs <= 0 ||
		!Array.isArray(probes.results) ||
		probes.results.length !== probes.rounds * ids.length * startupInteractionPhases.length
	)
		throw new Error('Incomplete startup interaction probes');
	return {
		rounds: probes.rounds,
		timeoutMs: probes.timeoutMs,
		rows: ids.flatMap((id) =>
			startupInteractionPhases.map((phase) => {
				const samples = probes.results.filter((r) => r.participant === id && r.phase === phase);
				if (
					samples.length !== probes.rounds ||
					new Set(samples.map((r) => r.round)).size !== probes.rounds ||
					samples.some(
						(r) =>
							!Number.isInteger(r.round) ||
							r.round < 0 ||
							r.round >= probes.rounds ||
							typeof r.passed !== 'boolean' ||
							typeof r.serviceReady !== 'boolean' ||
							!Number.isFinite(r.atMs) ||
							r.atMs < 0
					)
				)
					throw new Error('Invalid startup interaction probe population');
				return {
					name: id.replace('-controlled', ''),
					phase,
					attempted: samples.length,
					passed: samples.filter((r) => r.passed).length,
					beforeServiceReady: samples.filter((r) => !r.serviceReady).length,
					clickAtMs: summarizePercentiles(samples.map((r) => r.atMs))
				};
			})
		)
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const [input, output = 'apps/docs/src/data/performance-report.json'] = process.argv.slice(2);
	if (!input)
		throw new Error('Usage: publish-client-report.mjs <raw-browser.json> [docs-report.json]');
	const bytes = await readFile(input);
	const report = refreshClientReport(JSON.parse(await readFile(output, 'utf8')), JSON.parse(bytes));
	report.metadata.browserSource = {
		path: input,
		sha256: createHash('sha256').update(bytes).digest('hex')
	};
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
	console.log(output);
}
