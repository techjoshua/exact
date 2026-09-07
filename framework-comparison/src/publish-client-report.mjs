import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { summarizePercentiles } from './percentile-summary.mjs';
import { adaptFrameworkComparisonBrowser } from '../../scripts/component-local-target-abi/framework-comparison-adapters.mjs';

const metrics = {
	'Navigation completion': ['navigationMs', 1],
	'First contentful paint': ['firstContentfulPaintMs', 1],
	'Optimistic feedback': ['optimisticFeedbackMs', 1],
	'Authoritative settlement': ['settlementMs', 1],
	'Warm browser used heap': ['heapBytes', 1e-6]
};
const names = ['exact', 'react', 'sveltekit', 'nuxt', 'tanstack-start'];

/** Refreshes only browser charts from complete replay evidence; server captures retain their dates. */
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
			capture?.documentRequests !== raw.harness.sampleCount + raw.harness.browserWarmupCount ||
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
	const browserCharts = previous.browserCharts.map((chart) => {
		const [metric, scale] = metrics[chart.title] ?? [];
		if (!metric) throw new Error(`Unsupported browser chart: ${chart.title}`);
		return {
			...chart,
			comment: `${chart.title === 'Navigation completion' ? 'Navigation load completion, not hydration readiness. ' : ''}Captured production HTML and assets served by the common HTTP replay server; fresh cache-disabled contexts in a warm browser process. ${chart.title === 'Warm browser used heap' ? 'Post-interaction, post-GC retained JavaScript heap, including V8 code and metadata.' : 'Lower is better.'}`,
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
		browserCharts
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
