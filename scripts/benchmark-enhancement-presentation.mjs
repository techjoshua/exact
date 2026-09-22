import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cpus } from 'node:os';
import { buildEnhancementPerformanceFixtures } from './performance/fixture-build.mjs';
import { installPerformanceDom } from './performance/dom-environment.mjs';

const output = path.resolve(import.meta.dirname, '../.tmp/enhancement-presentation');
await mkdir(output, { recursive: true });
const paths = await buildEnhancementPerformanceFixtures(output);
const dom = installPerformanceDom();
try {
	const client = await import(pathToFileURL(paths.client).href);
	const server = await import(pathToFileURL(paths.server).href);
	const count = 100;
	const updates = 10;
	const results = {};
	for (const kind of [
		'plain',
		'intrinsic',
		'explicit',
		'enhanced',
		'coalesced',
		'intl',
		'intl-enhanced'
	]) {
		const samples = [];
		const hydration = await server.enhancementHydrationOutput(kind, count);
		for (let sample = -3; sample < 11; sample++) {
			const clientSample = client.measureEnhancementPopulation(kind, count, updates);
			const serverSample = await server.measureEnhancementServer(kind, count);
			const hydrationSample = client.measureEnhancementHydration(
				kind,
				count,
				hydration.html,
				hydration.resumptions
			);
			if (sample >= 0) samples.push({ ...clientSample, ...serverSample, ...hydrationSample });
		}
		results[kind] = {
			samples,
			median: Object.fromEntries(
				Object.keys(samples[0]).map((key) => [
					key,
					[...samples].map((sample) => sample[key]).sort((a, b) => a - b)[5]
				])
			)
		};
	}
	const report = {
		kind: 'compiled-enhancement-presentation',
		measuredAt: new Date().toISOString(),
		environment: { node: process.version, platform: process.platform, cpu: cpus()[0]?.model },
		count,
		updates,
		warmups: 3,
		samples: 11,
		limitations: [
			'JSDOM timings do not measure browser layout or painting.',
			'Explicit-host and unenhanced controls use the current runtime; these are not a previous-release baseline.',
			'Timing ratios are smoke budgets for this workload, not a browser frame-time guarantee.'
		],
		results
	};
	report.artifactBytes = {};
	for (const target of ['client', 'server']) {
		const bytes = await readFile(paths[target]);
		report.artifactBytes[target] = { raw: bytes.length, gzip: gzipSync(bytes).length };
	}
	// Broad same-run limits catch repeated discovery or construction without treating
	// scheduler noise as a small percentage regression against a different machine.
	report.budgets = [
		['enhanced', 'updatesMs', 'plain', 3],
		['intl-enhanced', 'updatesMs', 'intl', 2],
		['enhanced', 'mountMs', 'explicit', 5],
		['enhanced', 'hydrationMs', 'explicit', 3]
	].map(([kind, metric, control, limit]) => ({
		kind,
		metric,
		control,
		limit,
		ratio: results[kind].median[metric] / results[control].median[metric]
	}));
	if (globalThis.gc) {
		await new Promise((resolve) => setImmediate(resolve));
		globalThis.gc();
		const before = process.memoryUsage().heapUsed;
		report.retainedHeapAfterChurnBytes = [];
		for (let batch = 0; batch < 3; batch++) {
			for (let cycle = 0; cycle < 100; cycle++)
				client.measureEnhancementPopulation('enhanced', count, 1);
			await new Promise((resolve) => setImmediate(resolve));
			globalThis.gc();
			report.retainedHeapAfterChurnBytes.push({
				cycles: (batch + 1) * 100,
				delta: process.memoryUsage().heapUsed - before
			});
		}
	}
	const serialized = JSON.stringify(report, null, 2) + '\n';
	await writeFile(
		path.join(output, `measurements-${report.measuredAt.replaceAll(/[:.]/g, '-')}.json`),
		serialized
	);
	await writeFile(path.join(output, 'measurements.json'), serialized);
	for (const budget of report.budgets)
		if (budget.ratio > budget.limit)
			throw new Error(`Enhancement performance budget exceeded: ${JSON.stringify(budget)}`);
	console.log(
		JSON.stringify(
			Object.fromEntries(Object.entries(results).map(([kind, result]) => [kind, result.median])),
			null,
			2
		)
	);
} finally {
	dom.window.close();
}
