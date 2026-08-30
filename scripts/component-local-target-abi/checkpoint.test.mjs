import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createComponentLocalTargetAbiCheckpoint } from './checkpoint.mjs';
import { createComponentLocalTargetAbiStructuralReport } from './structural-report.mjs';

const counts = () => ({
	nativeComponents: 1,
	targetArtifacts: 1,
	declinedNativeJsxRegions: 0,
	fallbackBearingArtifacts: 0,
	genericNativeBindingGroups: 0,
	genericNativeRendererImports: 0,
	genericNativeSsrImports: 0,
	runtimeCreatedNativeArtifacts: 0,
	parentOwnedChildDirtyRouting: 0
});
const metric = (value) => ({ unit: 'ms', p50: value, p75: value, p95: value, p99: value });
const accepted = () => ({
	phase: 0,
	status: 'accepted',
	recordedAt: '2026-08-26T00:00:00.000Z',
	identity: {
		revision: 'abc',
		worktreePatchHash: 'patch',
		lockfileHash: 'lock',
		harnessHash: 'harness',
		productionBuildHashes: { browser: 'build' }
	},
	environment: {
		lineage: 'A',
		node: 'v24',
		bun: '1.2',
		chromium: '140',
		operatingSystem: 'Windows 11',
		cpu: 'CPU',
		memoryBytes: 16,
		powerMode: 'balanced',
		variables: {}
	},
	impact: {
		phase: 0,
		recordedAt: '2026-08-25T00:00:00.000Z',
		mechanisms: ['evidence only'],
		materiality: { timingNoiseRatio: 0.05, sizeBytes: 1, memoryBytes: 1 },
		areas: [
			{
				name: 'runtime',
				classification: 'stable',
				metrics: ['ready'],
				structuralEvidence: ['nativeComponents'],
				counterMetrics: ['DOM count']
			}
		]
	},
	correctness: [{ command: 'npm test', status: 'passed' }],
	structuralReport: createComponentLocalTargetAbiStructuralReport([
		{ id: 'Page', target: 'client', boundary: 'native', counts: counts() }
	]),
	suites: [
		{
			table: {
				suite: 'browser',
				participants: [
					{ name: 'exact', metrics: { ready: metric(1) } },
					{ name: 'control', metrics: { ready: metric(2) } }
				]
			},
			populations: [
				{
					name: 'browser samples',
					metrics: ['ready'],
					sampleCount: 2,
					warmupCount: 1,
					rawSamples: [
						{ name: 'exact', samples: [{ ready: 1 }, { ready: 1 }] },
						{ name: 'control', samples: [{ ready: 2 }, { ready: 2 }] }
					]
				}
			],
			artifactHashes: { bundle: 'hash' },
			responseHashes: { response: 'hash' }
		}
	]
});

test('accepts only a complete checkpoint and marks it eligible for the phase series', () => {
	const checkpoint = createComponentLocalTargetAbiCheckpoint(accepted(), {
		expectedSuites: ['browser']
	});
	assert.equal(checkpoint.checkpoint, 'P0');
	assert.equal(checkpoint.eligibleForSeries, true);
	assert.equal(checkpoint.structuralGate.status, 'passed');
});

test('rejects partial environment, suite, raw sample, and correctness evidence', () => {
	const noBrowser = accepted();
	delete noBrowser.environment.chromium;
	assert.throws(() => createComponentLocalTargetAbiCheckpoint(noBrowser), /Chromium identity/);

	const missingSuite = accepted();
	assert.throws(
		() =>
			createComponentLocalTargetAbiCheckpoint(missingSuite, { expectedSuites: ['browser', 'ssr'] }),
		/suite inventory mismatch/
	);

	const partialSample = accepted();
	delete partialSample.suites[0].populations[0].rawSamples[0].samples[0].ready;
	assert.throws(
		() => createComponentLocalTargetAbiCheckpoint(partialSample),
		/incomplete raw ready/
	);

	const failed = accepted();
	failed.correctness[0].status = 'failed';
	assert.throws(() => createComponentLocalTargetAbiCheckpoint(failed), /did not pass/);
});

test('records invalid attempts without admitting their timings to the series', () => {
	const candidate = accepted();
	candidate.status = 'invalid';
	candidate.reasons = ['Chromium setup failed'];
	delete candidate.suites;
	delete candidate.correctness;
	delete candidate.structuralReport;
	const checkpoint = createComponentLocalTargetAbiCheckpoint(candidate);
	assert.equal(checkpoint.eligibleForSeries, false);
	assert.deepEqual(checkpoint.reasons, ['Chromium setup failed']);
});

test('enforces phase-specific zero-fallback gates', () => {
	const candidate = accepted();
	candidate.phase = 3;
	candidate.impact.phase = 3;
	const fallback = counts();
	fallback.declinedNativeJsxRegions = 1;
	candidate.structuralReport = createComponentLocalTargetAbiStructuralReport([
		{ id: 'Page', target: 'client', boundary: 'native', counts: fallback }
	]);
	assert.throws(
		() => createComponentLocalTargetAbiCheckpoint(candidate),
		/declinedNativeJsxRegions=1/
	);
});

test('admits raw reported aggregates only when their percentiles match the table', () => {
	const candidate = accepted();
	for (const participant of candidate.suites[0].table.participants)
		participant.metrics.delay = metric(participant.name === 'exact' ? 3 : 4);
	candidate.suites[0].populations.push({
		name: 'event-loop histogram',
		kind: 'reported',
		metrics: ['delay'],
		rawSummaries: candidate.suites[0].table.participants.map((participant) => ({
			name: participant.name,
			observationCount: 100,
			metrics: { delay: { ...participant.metrics.delay } }
		}))
	});
	assert.equal(createComponentLocalTargetAbiCheckpoint(candidate).suites[0].populations.length, 2);
	candidate.suites[0].populations[1].rawSummaries[0].metrics.delay.p50 = 99;
	assert.throws(
		() => createComponentLocalTargetAbiCheckpoint(candidate),
		/reported delay.p50 drifted/
	);
});

test('requires an explicit reason when response identity is inapplicable', () => {
	const candidate = accepted();
	candidate.suites[0].responseHashes = {};
	candidate.suites[0].responseIdentity = {
		status: 'inapplicable',
		reason: 'The compiler timing lane produces no rendered response'
	};
	assert.equal(
		createComponentLocalTargetAbiCheckpoint(candidate).suites[0].responseIdentity.status,
		'inapplicable'
	);
	delete candidate.suites[0].responseIdentity.reason;
	assert.throws(
		() => createComponentLocalTargetAbiCheckpoint(candidate),
		/response identity reason/
	);
});

test('keeps the recorded Phase 0 impact contract admissible', async () => {
	const impact = JSON.parse(
		await readFile(
			new URL(
				'../../docs/performance-baselines/component-local-target-abi/phase-0-impact.json',
				import.meta.url
			),
			'utf8'
		)
	);
	const candidate = accepted();
	candidate.impact = impact;
	assert.equal(createComponentLocalTargetAbiCheckpoint(candidate).impact.phase, 0);
});
