import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	aggregateSsrThroughput,
	summarizeSsrSamples
} from '../../framework-comparison/src/ssr-benchmark-statistics.mjs';
import { validateRaw } from './framework-comparison-adapter-support.mjs';

const participants = [
	['Exact', 'exact'],
	['React', 'react'],
	['SvelteKit', 'sveltekit'],
	['Nuxt', 'nuxt'],
	['TanStack Start', 'tanstack-start']
];

/**
 * Refreshes public Node SSR charts from complete v2 evidence while preserving independently
 * captured browser evidence and its date. Aggregate throughput never replaces a window mean.
 * Recomputes throughput from raw windows and rejects inconsistent recorded summaries.
 */
export function refreshDocsSsrReport(previous, raw) {
	validateRaw(raw, 'framework-comparison-ssr-run');
	if (
		raw.complete !== true ||
		raw.publishable !== true ||
		raw.harness.throughputMethod !== 'deferred-validation-aggregate-v2'
	)
		throw new Error('Docs SSR refresh requires complete publishable v2 throughput evidence');
	const entries = raw.runtimes.node;
	const saturationCharts = raw.harness.saturationConcurrency.map((level) => ({
		title: `Sustained Node throughput - c${level}`,
		unit: 'RPS',
		precision: 0,
		comment: `Aggregate completed requests per second across ${raw.harness.saturationWindows} balanced ${raw.harness.saturationWindowMs} ms windows, including final drain. The mean and percentiles describe individual window rates; response validation runs outside each timed window. Higher is better.`,
		series: participants.map(([name, id]) => {
			const lane = entries[id].saturation[level];
			const aggregate = aggregateSsrThroughput(lane.windows);
			if (
				aggregate.requests !== lane.requests ||
				aggregate.elapsedMs !== lane.elapsedMs ||
				aggregate.aggregateRequestsPerSecond !== lane.aggregateRequestsPerSecond ||
				lane.windows.length !== raw.harness.saturationWindows
			)
				throw new Error(`${id}/c${level} has inconsistent throughput accounting`);
			const stats = summarizeSsrSamples(
				lane.windows.map((window) => (window.requests / window.elapsedMs) * 1000)
			);
			for (const key of Object.keys(stats))
				if (stats[key] !== lane.requestsPerSecond[key])
					throw new Error(`${id}/c${level} has inconsistent window statistics`);
			return { name, stats, aggregate: aggregate.aggregateRequestsPerSecond };
		})
	}));
	const sustained = saturationCharts.find((chart) => chart.title.endsWith('c32'));
	if (!sustained) throw new Error('Docs throughput headline requires concurrency 32');
	const burst = {
		title: `${raw.harness.concurrency}-request Node burst completion`,
		unit: 'ms',
		precision: 2,
		comment: `Elapsed time for all ${raw.harness.concurrency} requests in each finite burst to complete, without replacement requests. Response validation follows the timer. Lower is better.`,
		series: participants.map(([name, id]) => ({
			name,
			stats: summarizeSsrSamples(entries[id].concurrent.burstElapsedSamples)
		}))
	};
	const sequential = {
		...previous.server.sequential,
		series: participants.map(([name, id]) => ({
			name,
			stats: entries[id].sequential.client.totalMs
		}))
	};
	const retention = {
		...previous.server.retention,
		series: participants.map(([name, id]) => ({
			name,
			stats: summarizeSsrSamples(
				entries[id].retention.checkpoints
					.filter((point) => point.requests > 0)
					.map((point) => point.memory.heapUsed / 1e6)
			)
		}))
	};
	const bars = previous.server.bars
		.filter((chart) => chart.title === 'SSR response size')
		.map((chart) => ({
			...chart,
			values: participants.map(([name, id]) => ({ name, value: entries[id].response.bytes }))
		}));
	const responseComposition = {
		...previous.server.responseComposition,
		series: participants.slice(0, 2).map(([name, id]) => {
			const breakdown = entries[id].diagnostics.responseBreakdown;
			return {
				name,
				values: [
					'semanticMarkupBytes',
					'documentEnvelopeBytes',
					'frameworkMarkerCommentBytes',
					'frameworkIdentityAttributeBytes',
					'hydrationScriptBytes',
					'comparisonDataScriptBytes'
				].map((key) => breakdown[key])
			};
		})
	};
	return {
		...previous,
		schemaVersion: 2,
		metadata: {
			...previous.metadata,
			browserCreatedAt: previous.metadata.browserCreatedAt ?? previous.metadata.createdAt,
			capture: 'sustained-throughput-v2',
			createdAt: raw.createdAt,
			ssrCreatedAt: raw.createdAt,
			ssrSamples: raw.harness.saturationWindows,
			throughputMethod: raw.harness.throughputMethod,
			saturationWindowMs: raw.harness.saturationWindowMs
		},
		summary: [
			{
				label: 'Exact c32 aggregate RPS',
				value: Math.round(sustained.series[0].aggregate).toLocaleString('en-US'),
				context: 'sustained Node throughput'
			},
			...previous.summary.slice(1)
		],
		server: { sustained, burst, sequential, saturationCharts, retention, bars, responseComposition }
	};
}

/** Refreshes latency, memory, and payload evidence without replacing independent capacity metrics. */
export function refreshDocsSsrDiagnostics(previous, raw) {
	const refreshed = refreshDocsSsrReport(previous, raw);
	const { burst, sequential, retention, bars, responseComposition } = refreshed.server;
	for (const [id, entry] of Object.entries(raw.runtimes.node)) {
		if (
			entry.sequential.samples?.length !== raw.harness.sampleCount ||
			entry.concurrent.burstElapsedSamples?.length !== raw.harness.concurrencyWaves ||
			entry.sequential.samples.some(
				(sample) => !Number.isFinite(sample.totalMs) || sample.totalMs < 0
			) ||
			entry.concurrent.burstElapsedSamples.some((ms) => !Number.isFinite(ms) || ms < 0)
		)
			throw new Error(`${id}: incomplete latency populations`);
		sequential.series.find(
			(series) => series.name === participants.find(([, key]) => key === id)?.[0]
		).stats = summarizeSsrSamples(entry.sequential.samples.map((sample) => sample.totalMs));
	}
	return {
		...previous,
		metadata: {
			...previous.metadata,
			ssrCreatedAt: raw.createdAt,
			ssrSequentialSamples: raw.harness.sampleCount,
			ssrBurstSamples: raw.harness.concurrencyWaves,
			ssrRetentionCheckpoints: raw.harness.retentionBatches,
			ssrDiagnosticsEnvironment: raw.environment
		},
		server: { ...previous.server, burst, sequential, retention, bars, responseComposition }
	};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [previousPath, rawPath, output] = process.argv.slice(2);
	if (!output)
		throw new Error(
			'Usage: refresh-docs-ssr-report.mjs <previous-report> <raw-ssr> <output> [--diagnostics-only]'
		);
	const bytes = await readFile(rawPath);
	const refresh = process.argv.includes('--diagnostics-only')
		? refreshDocsSsrDiagnostics
		: refreshDocsSsrReport;
	const report = refresh(JSON.parse(await readFile(previousPath, 'utf8')), JSON.parse(bytes));
	report.metadata.sources = {
		...report.metadata.sources,
		...(process.argv.includes('--diagnostics-only')
			? {
					ssrDiagnostics: {
						path: rawPath,
						sha256: createHash('sha256').update(bytes).digest('hex')
					}
				}
			: {
					'ssr-50.json': { path: rawPath, sha256: createHash('sha256').update(bytes).digest('hex') }
				})
	};
	await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
