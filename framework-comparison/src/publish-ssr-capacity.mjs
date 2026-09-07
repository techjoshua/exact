import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { summarizeSsrCapacityCapture } from './ssr-capacity-report.mjs';

/** Builds the public report only when preloaded and normal captures use identical target artifacts. */
export function createSsrCapacityReport(preloaded, normal) {
	const runtimeId = normal.runtimeId ?? 'node';
	assert.ok(['node', 'bun'].includes(runtimeId), 'Unknown target runtime');
	const runtimeName = `${runtimeId === 'bun' ? 'Bun' : 'Node'} ${normal.environment.runtimes[runtimeId]}`;
	assert.equal(normal.plan.preloaded, false, 'Normal-loading evidence must be explicit');
	for (const capture of [preloaded.multi, preloaded.arrivals, normal]) {
		assert.equal(
			capture.runtimeId ?? 'node',
			runtimeId,
			'Captures must share their target runtime'
		);
		if (runtimeId === 'bun')
			assert.deepEqual(
				capture.transports,
				{ exact: 'bun-fetch', react: 'bun-fetch' },
				'Bun captures must use native transports'
			);
		assert.deepEqual([...new Set(capture.blocks.map((block) => block.id))].sort(), [
			'exact',
			'react'
		]);
		assert.deepEqual(
			capture.environment,
			normal.environment,
			'Captures must share runtime and host metadata'
		);
		for (const block of capture.blocks) {
			const expected = preloaded.multi.blocks.find((entry) => entry.id === block.id).results[0]
				.identity;
			for (const result of block.results) {
				assert.deepEqual(
					result.identity,
					expected,
					'Workload response identity must match across captures'
				);
				assert.equal(
					new URL(result.plan.url).searchParams.has('__benchmarkPreloaded'),
					capture !== normal
				);
			}
		}
	}
	for (const id of ['exact', 'react']) {
		assert.equal(normal.artifacts[id].sha256, preloaded.multi.artifacts[id].sha256);
		assert.equal(preloaded.arrivals.artifacts[id].sha256, preloaded.multi.artifacts[id].sha256);
	}
	for (const key of ['server', runtimeId === 'bun' ? 'bunAdapter' : 'nodeAdapter']) {
		assert.equal(normal.artifacts[key].hash, preloaded.multi.artifacts[key].hash);
		assert.equal(preloaded.arrivals.artifacts[key].hash, preloaded.multi.artifacts[key].hash);
	}
	const arrivals = summarizeSsrCapacityCapture(preloaded.arrivals, { allowArrivalErrors: true });
	const requestErrors = arrivals.reduce((sum, row) => sum + row.requestErrors, 0);
	return {
		createdAt: preloaded.multi.createdAt,
		runtime: runtimeName,
		normalCreatedAt: normal.createdAt,
		arrivalsCreatedAt: preloaded.arrivals.createdAt,
		method: `Preloaded sweep: ${describeStages(preloaded.multi)}. Normal loading: ${describeStages(normal)}. Arrivals: ${describeStages(preloaded.arrivals)}. Each capture uses two reversed process populations on ${normal.environment.platform}, target ${runtimeName}, Node ${normal.environment.runtimes.node} load drivers, ${normal.environment.cpu.model.trim()}`,
		validation: requestErrors
			? `${requestErrors} request errors in scheduled arrivals; zero in concurrency captures. Response identities and accounting validated; RPS counts valid responses only`
			: 'Zero request errors in these captures; response identities and accounting validated',
		preloaded: summarizeSsrCapacityCapture(preloaded.multi),
		normal: summarizeSsrCapacityCapture(normal),
		arrivals
	};
}

/** Describes the admitted plan's warmup and measured durations without assuming fixed example values. */
function describeStages(capture) {
	const warmup =
		capture.plan.stages
			.filter((stage) => stage.discard)
			.reduce((sum, stage) => sum + stage.durationMs, 0) / 1000;
	const durations = [
		...new Set(
			capture.plan.stages.filter((stage) => !stage.discard).map((stage) => stage.durationMs / 1000)
		)
	];
	return `${warmup} s warmup and ${durations.join('/')} s per measured stage`;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	const [preloadedPath, experimentsPath, outputPath] = process.argv.slice(2);
	if (!preloadedPath || !experimentsPath || !outputPath)
		throw new Error(
			'Usage: publish-ssr-capacity.mjs <preloaded-archive.json> <experiments-archive.json> <output.json>'
		);
	const preloaded = JSON.parse(await readFile(resolve(preloadedPath), 'utf8'));
	const experiments = JSON.parse(await readFile(resolve(experimentsPath), 'utf8'));
	await writeFile(
		resolve(outputPath),
		JSON.stringify(createSsrCapacityReport(preloaded, experiments.normal), null, 2) + '\n'
	);
}
