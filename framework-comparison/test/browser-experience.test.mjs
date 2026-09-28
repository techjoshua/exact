import test from 'node:test';
import assert from 'node:assert/strict';
import { readBrowserExperience } from '../src/browser-experience.mjs';

test('keeps the complete first interaction and excludes unrelated later input', () => {
	globalThis.__frameworkComparisonExperience = {
		serviceReadyMs: 42,
		interactions: [{ entryType: 'first-input', interactionId: 7, duration: 8 }],
		observers: [
			{
				takeRecords: () => [
					{ interactionId: 7, duration: 32 },
					{ interactionId: 9, duration: 120 }
				]
			}
		]
	};
	try {
		assert.deepEqual(readBrowserExperience(), { serviceReadyMs: 42, interactionDurationMs: 32 });
	} finally {
		delete globalThis.__frameworkComparisonExperience;
	}
});

test('does not invent zero latency when event timing is unavailable', () => {
	globalThis.__frameworkComparisonExperience = { interactions: [], observers: [] };
	try {
		assert.throws(readBrowserExperience, /did not report/);
	} finally {
		delete globalThis.__frameworkComparisonExperience;
	}
});

test('startup layout shifts use session windows, exclude input, and drain queued records', async () => {
	const { readBrowserVitals } = await import('../src/browser-vitals.mjs');
	const saved = {
		document: globalThis.document,
		NodeFilter: globalThis.NodeFilter,
		Node: globalThis.Node
	};
	globalThis.document = {
		createTreeWalker: () => ({ nextNode: () => null }),
		getElementsByTagName: () => []
	};
	globalThis.NodeFilter = { SHOW_ALL: 0 };
	globalThis.Node = { COMMENT_NODE: 8, TEXT_NODE: 3 };
	globalThis.__frameworkComparisonVitals = {
		largestContentfulPaintMs: 1,
		longTasks: [],
		shifts: [
			{ startTime: 100, value: 0.1 },
			{ startTime: 200, value: 0.15 },
			{ startTime: 300, value: 1, hadRecentInput: true },
			{ startTime: 1400, value: 0.2 }
		],
		observers: [[{ takeRecords: () => [{ startTime: 1600, value: 0.1 }] }, 'shift']]
	};
	try {
		assert.equal(readBrowserVitals().cumulativeLayoutShift, 0.2 + 0.1);
	} finally {
		Object.assign(globalThis, saved);
		delete globalThis.__frameworkComparisonVitals;
	}
});
