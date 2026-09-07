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
 * Refreshes public SSR charts for the selected runtime from complete v2 evidence while
 * preserving independently captured browser evidence and its date. Aggregate throughput never replaces a window mean.
 * Recomputes throughput from raw windows and rejects inconsistent recorded summaries.
 */
export function refreshDocsSsrReport(previous, raw, runtimeId = 'node') {
	if (!['node', 'bun'].includes(runtimeId)) throw new Error(`Unsupported SSR runtime ${runtimeId}`);
	const runtimeName = runtimeId === 'node' ? 'Node' : 'Bun';
	validateRaw(raw, 'framework-comparison-ssr-run');
	if (
		raw.complete !== true ||
		raw.publishable !== true ||
		raw.harness.throughputMethod !== 'deferred-validation-aggregate-v2'
	)
		throw new Error('Docs SSR refresh requires complete publishable v2 throughput evidence');
	const entries = raw.runtimes[runtimeId];
	const saturationCharts = raw.harness.saturationConcurrency.map((level) => ({
		title: `Sustained ${runtimeName} throughput - c${level}`,
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
		title: `${raw.harness.concurrency}-request ${runtimeName} burst completion`,
		unit: 'ms',
		precision: 2,
		comment: `Elapsed time for all ${raw.harness.concurrency} requests in each finite burst to complete, without replacement requests. Response validation follows the timer. Lower is better.`,
		series: participants.map(([name, id]) => ({
			name,
			stats: summarizeSsrSamples(entries[id].concurrent.burstElapsedSamples)
		}))
	};
	const phases = entries.exact.sequential.worker?.phases;
	const sequential = {
		...previous.server.sequential,
		comment:
			'Complete warm HTTP response latency, including fixture fetching and rendering. Lower is better.' +
			(phases
				? ` In this capture, eXact mean data loading was ${phases.dataLoadMs.mean.toFixed(2)} ms and rendering was ${phases.renderMs.mean.toFixed(2)} ms.`
				: ''),
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
	if (runtimeId === 'bun') {
		sequential.title = 'Warm sequential response latency (Bun)';
		retention.title = 'Retained server heap (Bun)';
		retention.comment =
			'Absolute Bun JavaScriptCore heap after garbage collection at bounded request checkpoints. Lower is better; this does not measure allocation volume.';
	}
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
				context: `sustained ${runtimeName} throughput`
			},
			...previous.summary.slice(1)
		],
		server: { sustained, burst, sequential, saturationCharts, retention, bars, responseComposition }
	};
}

/**
 * Refreshes latency, memory, and payload evidence without replacing independent capacity metrics.
 * Defaults to Node and includes Bun when present, with independent capture provenance for each.
 */
export function refreshDocsSsrDiagnostics(previous, raw, runtimeId = 'node') {
	const refreshed = refreshDocsSsrReport(previous, raw, runtimeId);
	const { burst, sequential, retention, bars, responseComposition } = refreshed.server;
	for (const [id, entry] of Object.entries(raw.runtimes[runtimeId])) {
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
		server: {
			...(runtimeId === 'node' ? previous.server : {}),
			burst,
			sequential,
			retention,
			bars,
			responseComposition,
			...(runtimeId === 'node' && raw.runtimes.bun
				? {
						bun: {
							...refreshDocsSsrDiagnostics(previous, raw, 'bun').server,
							runtime: raw.environment.runtimes.bun,
							createdAt: raw.createdAt,
							sequentialSamples: raw.harness.sampleCount,
							burstSamples: raw.harness.concurrencyWaves,
							retentionCheckpoints: raw.harness.retentionBatches
						}
					}
				: {})
		}
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
