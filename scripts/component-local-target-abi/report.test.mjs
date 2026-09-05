import assert from 'node:assert/strict';
import test from 'node:test';

import { renderComponentLocalTargetAbiCheckpointReport } from './report.mjs';

test('renders every participant, percentile, comparison, and structural counter', () => {
	const metric = { unit: 'ms', p50: 1, p75: 2, p95: 3, p99: 4 };
	const checkpoint = {
		checkpoint: 'P1',
		eligibleForSeries: true,
		identity: { revision: 'abc' },
		environment: { lineage: 'A' },
		limitations: [],
		analysis: {
			improvements: ['fewer calls'],
			regressions: ['larger artifact'],
			unexpected: ['stable lane moved'],
			disposition: ['remove the duplicate in P2']
		},
		suites: [
			{
				sourcePublication: {
					status: 'non-publishable',
					reason: 'source measurement was explicitly marked non-publishable'
				},
				sourceLimitations: ['local loopback'],
				table: {
					suite: 'framework-comparison-browser',
					metrics: ['ready'],
					participants: [
						{ name: 'exact', metrics: { ready: metric } },
						{ name: 'control', metrics: { ready: { ...metric, p50: 5 } } },
						{ name: 'tanstack-start-controlled', metrics: { ready: { ...metric, p50: 6 } } }
					]
				},
				populations: [
					{
						name: 'browser',
						metrics: ['ready'],
						sampleCount: 7,
						warmupCount: 1
					}
				]
			}
		],
		structuralReport: {
			native: {
				artifacts: 1,
				byTarget: { client: 1, server: 0 },
				totals: { targetArtifacts: 1, declinedNativeJsxRegions: 0 }
			},
			explicitBoundaries: {
				react: {
					artifacts: 0,
					byTarget: { client: 0, server: 0 },
					totals: { targetArtifacts: 0, declinedNativeJsxRegions: 0 }
				},
				plugin: {
					artifacts: 0,
					byTarget: { client: 0, server: 0 },
					totals: { targetArtifacts: 0, declinedNativeJsxRegions: 0 }
				},
				test: {
					artifacts: 0,
					byTarget: { client: 0, server: 0 },
					totals: { targetArtifacts: 0, declinedNativeJsxRegions: 0 }
				}
			}
		}
	};
	const markdown = renderComponentLocalTargetAbiCheckpointReport(checkpoint, [
		{
			baseline: 'P0',
			suite: 'browser',
			rows: [
				{
					metric: 'ready',
					unit: 'ms',
					percentile: 'p50',
					beforeRaw: 2,
					rawDelta: -1,
					rawDeltaRatio: -0.5,
					controlFactor: 1.1,
					normalizedBefore: 2.2,
					current: 1,
					delta: -1.2,
					deltaRatio: -0.545454,
					confidence: 'high'
				}
			]
		}
	]);
	assert.match(markdown, /\| eXact \| 1 \/ 2 \/ 3 \/ 4 \|/);
	assert.match(markdown, /\| control \| 5 \/ 2 \/ 3 \/ 4 \|/);
	assert.match(markdown, /\| TanStack Start \| 6 \/ 2 \/ 3 \/ 4 \|/);
	assert.match(markdown, /browser vs P0/);
	assert.match(markdown, /Raw delta %/);
	assert.match(markdown, /-50%/);
	assert.match(markdown, /declinedNativeJsxRegions/);
	assert.match(markdown, /does not determine ABI checkpoint eligibility/);
	assert.match(markdown, /Source limitations: local loopback/);
	assert.match(markdown, /Material-change analysis/);
	assert.match(markdown, /stable lane moved/);
	assert.ok(markdown.lastIndexOf('Disposition') > markdown.lastIndexOf('Structural evidence'));
});

test('refuses to publish diagnostic or invalid evidence', () => {
	assert.throws(
		() => renderComponentLocalTargetAbiCheckpointReport({ eligibleForSeries: false }),
		/only an accepted/
	);
});
