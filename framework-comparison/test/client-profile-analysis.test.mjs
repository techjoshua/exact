import assert from 'node:assert/strict';
import test from 'node:test';
import {
	summarizeCpuProfile,
	summarizeFrameworkProfileEvents,
	summarizeHeapSamplingProfile
} from '../src/client-profile-analysis.mjs';

test('CPU profiles attribute self samples and elapsed sample time to source locations', () => {
	const summary = summarizeCpuProfile({
		startTime: 1_000,
		endTime: 6_000,
		nodes: [
			{ id: 1, callFrame: { functionName: 'render', url: 'http://app/app.js', lineNumber: 2 } },
			{ id: 2, callFrame: { functionName: 'bind', url: 'http://app/app.js', lineNumber: 8 } }
		],
		samples: [1, 2, 1],
		timeDeltas: [1_000, 2_000, 2_000]
	});

	assert.equal(summary.durationMs, 5);
	assert.equal(summary.totalSamples, 3);
	assert.equal(summary.topSites[0].functionName, 'render');
	assert.equal(summary.topSites[0].sampledMs, 3);
	assert.equal(summary.byUrl[0].sampledMs, 5);
});

test('framework profile events aggregate repeated focused phases', () => {
	assert.deepEqual(
		summarizeFrameworkProfileEvents([
			{ subsystem: 'dom', phase: 'program-claim', elapsedMs: 0.2 },
			{ subsystem: 'dom', phase: 'program-claim', elapsedMs: 0.3 },
			{ subsystem: 'hydrate', phase: 'hydrate', elapsedMs: 2 },
			{ subsystem: 'dom', phase: 'program-bind', elapsedMs: Number.NaN }
		]),
		[
			{ subsystem: 'hydrate', phase: 'hydrate', elapsedMs: 2, events: 1 },
			{ subsystem: 'dom', phase: 'program-claim', elapsedMs: 0.5, events: 2 }
		]
	);
});

test('heap sampling profiles retain allocation-site and URL byte attribution', () => {
	const summary = summarizeHeapSamplingProfile({
		head: {
			callFrame: { functionName: '(root)' },
			selfSize: 0,
			children: [
				{
					callFrame: { functionName: 'construct', url: 'http://app/app.js', lineNumber: 4 },
					selfSize: 64,
					children: []
				},
				{
					callFrame: { functionName: 'mount', url: 'http://app/app.js', lineNumber: 9 },
					selfSize: 32,
					children: []
				}
			]
		},
		samples: [{ size: 64, nodeId: 2 }]
	});

	assert.equal(summary.sampledBytes, 96);
	assert.equal(summary.sampleCount, 1);
	assert.equal(summary.topSites[0].functionName, 'construct');
	assert.equal(summary.byUrl[0].sampledBytes, 96);
});
