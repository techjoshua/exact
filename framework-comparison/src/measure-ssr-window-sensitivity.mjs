import { assertComparisonNetwork } from './network-environment.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { balancedRoundOrder } from './balanced-round-order.mjs';
import {
	measureSsrRequest,
	resetSsrClientConnections,
	runSustainedSsrWindow
} from './ssr-benchmark-client.mjs';
import { aggregateSsrThroughput, summarizeSsrSamples } from './ssr-benchmark-statistics.mjs';
import {
	availableSsrRuntimes,
	measureSsrArtifact,
	ssrEnvironmentMetadata
} from './ssr-run-environment.mjs';
import { startSsrWorker, stopSsrWorker } from './ssr-worker-controller.mjs';
import { settleSsrWorkerInventoryStartup } from './ssr-worker-inventory.mjs';
import { startComparisonServer } from './server.mjs';

const suiteRoot = fileURLToPath(new URL('..', import.meta.url));
const ids = ['exact', 'react', 'sveltekit', 'nuxt', 'tanstack-start'];
const durations = [100, 250, 500, 1000];
const levels = [16, 32];

/**
 * Compares window lengths across four fresh Node worker populations with balanced duration,
 * concurrency, and participant order. Every response is checked outside its load interval.
 * Requires existing production builds; owns and closes its controlled service and workers.
 */
export async function measureSsrWindowSensitivity(output) {
	assertComparisonNetwork();
	const runtime = availableSsrRuntimes('node')[0];
	const report = {
		kind: 'framework-comparison-ssr-window-sensitivity',
		throughputMethod: 'deferred-validation-aggregate-v2',
		createdAt: new Date().toISOString(),
		environment: ssrEnvironmentMetadata([runtime]),
		durations,
		levels,
		epochs: [],
		artifacts: {}
	};
	for (const id of ids) {
		const directory =
			id === 'exact' || id === 'react'
				? 'dist-server'
				: id === 'sveltekit'
					? 'build/server'
					: '.output/server';
		report.artifacts[id] = await measureSsrArtifact(
			path.join(suiteRoot, 'participants', id, directory)
		);
	}
	await mkdir(path.dirname(output), { recursive: true });
	const service = await startComparisonServer();
	try {
		for (let epoch = 0; epoch < 4; epoch++) {
			const entries = balancedRoundOrder(ids, epoch).map((key) => ({ key }));
			const startup = await settleSsrWorkerInventoryStartup(entries, (entry) =>
				startSsrWorker({
					runtime,
					participantId: entry.key,
					transport: 'node-http',
					workerPath: path.join(suiteRoot, 'src/ssr-benchmark-worker.mjs'),
					workingDirectory: suiteRoot,
					serviceUrl: service.url
				})
			);
			try {
				if (startup.failure) throw startup.failure;
				for (const entry of entries) {
					entry.identity = await measureSsrRequest(entry.worker.url);
					validateWindow(entry, await runSustainedSsrWindow(entry.worker.url, 32, 2000));
				}
				const windows = [];
				for (let round = 0; round < 5; round++) {
					for (const durationMs of balancedRoundOrder(durations, round, epoch)) {
						for (const concurrency of balancedRoundOrder(levels, round, epoch)) {
							for (const entry of balancedRoundOrder(
								entries,
								round,
								epoch + durations.indexOf(durationMs)
							)) {
								const measured = await runSustainedSsrWindow(
									entry.worker.url,
									concurrency,
									durationMs
								);
								validateWindow(entry, measured);
								windows.push({
									round,
									participant: entry.key,
									concurrency,
									durationMs,
									requests: measured.samples.length,
									elapsedMs: measured.elapsedMs
								});
							}
						}
					}
					console.log(`Window sensitivity population ${epoch + 1}/4, round ${round + 1}/5`);
				}
				report.epochs.push({ epoch, windows });
				await writeFile(output, JSON.stringify(report, null, 2));
			} finally {
				for (const worker of startup.workers) await stopSsrWorker(worker);
				resetSsrClientConnections();
			}
		}
		report.summary = ids.flatMap((participant) =>
			levels.flatMap((concurrency) =>
				durations.map((durationMs) => {
					const windows = report.epochs
						.flatMap((epoch) => epoch.windows)
						.filter(
							(window) =>
								window.participant === participant &&
								window.concurrency === concurrency &&
								window.durationMs === durationMs
						);
					return {
						participant,
						concurrency,
						durationMs,
						...aggregateSsrThroughput(windows),
						windowRates: summarizeSsrSamples(
							windows.map((window) => (window.requests / window.elapsedMs) * 1000)
						)
					};
				})
			)
		);
		report.complete = true;
		await writeFile(output, JSON.stringify(report, null, 2));
		return report;
	} finally {
		await service.close();
	}
}

function validateWindow(entry, measured) {
	if (
		!entry.identity.meaningful ||
		measured.samples.some(
			(sample) =>
				!sample.meaningful ||
				sample.bytes !== entry.identity.bytes ||
				sample.hash !== entry.identity.hash
		)
	)
		throw new Error(`${entry.key} returned an invalid or unstable SSR response`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
	await measureSsrWindowSensitivity(
		path.resolve(
			process.env.COMPARISON_SSR_WINDOW_STUDY_OUTPUT ?? '.tmp/ssr-window-sensitivity.json'
		)
	);
