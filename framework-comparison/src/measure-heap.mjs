import { assertComparisonNetwork } from './network-environment.mjs';
import { startClientBenchmarkHarness } from './client-benchmark-harness.mjs';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { cpus, platform, release, totalmem } from 'node:os';
import { chromium } from 'playwright';
import { hashArtifactDirectory } from './artifact-integrity.mjs';
import { balancedRoundOrder } from './balanced-round-order.mjs';
import { captureHeapComposition } from './browser-heap-snapshot.mjs';
import { measureRetainedMemory } from './browser-memory.mjs';
import { waitForSemanticReady, runProfiledInteraction } from './client-profiling.mjs';
import { createHeapCompositionReport } from './browser-heap-composition.mjs';

if (!process.argv.includes('--correctness-passed'))
	throw new Error('Run npm run measure:heap so the shared correctness suite gates capture.');
const sampleCount = Number(process.env.COMPARISON_HEAP_SAMPLES ?? 5);
if (!Number.isSafeInteger(sampleCount) || sampleCount < 1)
	throw new Error('COMPARISON_HEAP_SAMPLES must be a positive integer');
const network = assertComparisonNetwork();
const suiteRoot = resolve(import.meta.dirname, '..');
const participants = [
	{ id: 'exact', name: 'eXact', artifact: 'dist', port: 4401 },
	{ id: 'react', name: 'React', artifact: 'dist', port: 4402 },
	{ id: 'sveltekit', name: 'SvelteKit', artifact: 'build/client', port: 4403 },
	{ id: 'nuxt', name: 'Nuxt', artifact: '.output/public', port: 4404 },
	{ id: 'tanstack-start', name: 'TanStack Start', artifact: '.output/public', port: 4405 }
];
for (const participant of participants) {
	participant.artifactHash = await hashArtifactDirectory(
		resolve(suiteRoot, 'participants', participant.id, participant.artifact)
	);
	participant.samples = [];
}
const harness = await startClientBenchmarkHarness(participants);
let browser;
try {
	browser = await chromium.launch();
	const sampleOrders = [];
	// One complete discarded round exercises the same scenario before diagnostic capture.
	for (let round = -1; round < sampleCount; round++) {
		const order = balancedRoundOrder(participants, Math.max(0, round));
		if (round >= 0) sampleOrders.push(order.map(({ id }) => id));
		for (const participant of order) {
			const sample = await captureSample(browser, participant, round >= 0);
			if (round >= 0) participant.samples.push(sample);
			console.log(`Heap ${round < 0 ? 'warmup' : round + 1}/${sampleCount}: ${participant.name}`);
		}
	}
	for (const participant of participants) {
		const current = await hashArtifactDirectory(
			resolve(suiteRoot, 'participants', participant.id, participant.artifact)
		);
		if (current !== participant.artifactHash)
			throw new Error(`${participant.name} artifacts changed during capture`);
	}
	const run = {
		schemaVersion: 1,
		kind: 'framework-comparison-heap-composition',
		createdAt: new Date().toISOString(),
		commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRoot, encoding: 'utf8' }).trim(),
		workingTreeDirty: Boolean(
			execFileSync('git', ['status', '--porcelain'], { cwd: suiteRoot, encoding: 'utf8' }).trim()
		),
		browserVersion: browser.version(),
		environment: {
			network,
			node: process.version,
			platform: platform(),
			release: release(),
			cpu: cpus()[0]?.model,
			totalMemoryBytes: totalmem()
		},
		correctness: { status: 'passed', command: 'npm run test:e2e' },
		sampleCount,
		sampleOrders,
		clientDelivery: harness.evidence(),
		warmupCount: 1,
		measurement: 'unprofiled-post-claim-post-gc-snapshot-self-bytes',
		participants
	};
	// Validate the additive public projection before retaining the evidence.
	createHeapCompositionReport(run);
	const output = resolve(
		process.env.COMPARISON_HEAP_OUTPUT ?? resolve(suiteRoot, 'results/browser-heap.json')
	);
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(run, null, 2)}\n`);
	console.log(`Heap composition written to ${output}`);
} finally {
	try {
		await browser?.close();
	} finally {
		await harness.close();
	}
}

/** Owns one fresh cache-disabled page; captures only after authoritative settlement, without profilers. */
async function captureSample(browser, participant, snapshot) {
	const reset = await fetch('http://127.0.0.1:4310/__benchmark/reset', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-benchmark-control': 'fixture-reset' },
		body: '{}'
	});
	if (!reset.ok) throw new Error(`Fixture reset failed: ${reset.status}`);
	const context = await browser.newContext();
	try {
		const page = await context.newPage();
		const session = await context.newCDPSession(page);
		await session.send('Network.enable');
		await session.send('Network.setCacheDisabled', { cacheDisabled: true });
		await session.send('Performance.enable');
		await page.goto(`http://127.0.0.1:${participant.port}/incidents/inc-100`, {
			waitUntil: 'domcontentloaded'
		});
		await waitForSemanticReady(page);
		await runProfiledInteraction(page);
		await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done())));
		const retainedMemory = await measureRetainedMemory(session);
		return snapshot
			? { retainedMemory, composition: await captureHeapComposition(session) }
			: undefined;
	} finally {
		await context.close();
	}
}
