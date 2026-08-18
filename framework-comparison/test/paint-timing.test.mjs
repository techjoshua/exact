import assert from 'node:assert/strict';
import test from 'node:test';

import { firstContentfulPaintTiming } from '../src/paint-timing.mjs';

test('keeps standard FCP distinct from optional render and presentation timestamps', () => {
	assert.deepEqual(
		firstContentfulPaintTiming({ startTime: 12.25, paintTime: 11.75, presentationTime: 12.2 }),
		{ startTimeMs: 12.25, paintTimeMs: 11.75, presentationTimeMs: 12.2 }
	);
	assert.deepEqual(firstContentfulPaintTiming({ startTime: 12 }), {
		startTimeMs: 12,
		paintTimeMs: null,
		presentationTimeMs: null
	});
});
