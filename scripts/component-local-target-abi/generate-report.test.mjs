import assert from 'node:assert/strict';
import test from 'node:test';

import { generateComponentLocalTargetAbiReport } from './generate-report.mjs';
import { createComponentLocalTargetAbiStructuralReport } from './structural-report.mjs';

const counts = {
	nativeComponents: 1,
	targetArtifacts: 1,
	declinedNativeJsxRegions: 0,
	fallbackBearingArtifacts: 0,
	genericNativeBindingGroups: 0,
	genericNativeRendererImports: 0,
	genericNativeSsrImports: 0,
	runtimeCreatedNativeArtifacts: 0,
	parentOwnedChildDirtyRouting: 0
};

function checkpoint(status = 'accepted') {
	const metric = (value) => ({ unit: 'ms', p50: value, p75: value, p95: value, p99: value });
	return {
		phase: 0,
		status,
		recordedAt: '2026-08-26T00:00:00.000Z',
		identity: {
			revision: 'abc',
			worktreePatchHash: 'patch',
			lockfileHash: 'lock',
			harnessHash: 'harness',
			productionBuildHashes: { browser: 'hash' }
		},
		environment: {
			lineage: 'A',
			node: 'v24',
			bun: '1.2',
			chromium: '140',
			operatingSystem: 'Windows',
			cpu: 'CPU',
			memoryBytes: 16,
			powerMode: 'balanced',
			variables: {}
		},
		impact: {
			phase: 0,
			recordedAt: '2026-08-25T00:00:00.000Z',
			mechanisms: ['reporting'],
			materiality: { timingNoiseRatio: 0.1, sizeBytes: 1, memoryBytes: 1 },
			areas: [
				{
					name: 'runtime',
					classification: 'stable',
					metrics: ['ready'],
					structuralEvidence: ['targetArtifacts'],
					counterMetrics: ['DOM']
				}
			]
		},
		correctness: [{ command: 'npm test', status: 'passed' }],
		structuralReport: createComponentLocalTargetAbiStructuralReport([
			{ id: 'Page', target: 'client', boundary: 'native', counts }
		]),
		suites: [
			{
				table: {
					suite: 'browser',
					participants: [
						{ name: 'exact', metrics: { ready: metric(1) } },
						{ name: 'react', metrics: { ready: metric(2) } },
						{ name: 'svelte', metrics: { ready: metric(3) } }
					]
				},
				populations: [
					{
						name: 'browser samples',
						metrics: ['ready'],
						sampleCount: 1,
						warmupCount: 0,
						rawSamples: [
							{ name: 'exact', samples: [{ ready: 1 }] },
							{ name: 'react', samples: [{ ready: 2 }] },
							{ name: 'svelte', samples: [{ ready: 3 }] }
						]
					}
				],
				artifactHashes: { browser: 'hash' },
				responseHashes: { response: 'hash' }
			}
		]
	};
}

test('generates canonical JSON inputs and a complete report from accepted evidence', async () => {
	const files = new Map([['current.json', checkpoint()]]);
	const generated = await generateComponentLocalTargetAbiReport(
		{ checkpoint: 'current.json', expectedSuites: ['browser'], baselines: [] },
		async (path) => files.get(path)
	);
	assert.equal(generated.checkpoint.eligibleForSeries, true);
	assert.match(generated.markdown, /browser/);
});

test('refuses a diagnostic checkpoint before writing publishable output', async () => {
	const candidate = checkpoint('diagnostic');
	delete candidate.correctness;
	delete candidate.structuralReport;
	delete candidate.suites;
	candidate.diagnostic = {
		question: 'Does it work?',
		hypothesis: 'Yes',
		alternatives: ['A'],
		correctnessAssertion: 'passes',
		decisionThreshold: 'one percent'
	};
	await assert.rejects(
		generateComponentLocalTargetAbiReport(
			{ checkpoint: 'diagnostic.json', expectedSuites: ['browser'] },
			async () => candidate
		),
		/cannot generate a published report/
	);
});

test('refuses mutable performance capture paths for accepted checkpoints', async () => {
	await assert.rejects(
		generateComponentLocalTargetAbiReport(
			{
				checkpoint: 'current.json',
				internalPerformance: '.tmp/release-performance-output.json',
				expectedSuites: ['browser']
			},
			async (path) => (path === 'current.json' ? checkpoint() : {})
		),
		/must name an immutable phase-specific capture/
	);
});
