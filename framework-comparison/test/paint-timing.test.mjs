import test from 'node:test';

import assert from 'node:assert/strict';
import { waitForFirstContentfulPaint } from '../src/paint-timing.mjs';

test('reads the standard first-contentful-paint start time', async () => {
	const previousPerformance = globalThis.performance;
	globalThis.performance = {
		getEntriesByName: () => [{ startTime: 12.25 }]
	};
	try {
		assert.equal(await waitForFirstContentfulPaint(), 12.25);
	} finally {
		globalThis.performance = previousPerformance;
	}
});
