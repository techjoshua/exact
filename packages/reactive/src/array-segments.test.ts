import { it } from 'vitest';
import { reactive, batch, captureReactiveMutations } from './index.js';
import { verifyArraySegments } from '../../component-composition-corpus/test-support/array-segment-journey.mjs';

it.each([3, 140_000])(
	'restores coerced edits and releases retained slots for %i entries',
	(count) => {
		verifyArraySegments({ reactive, batch, captureReactiveMutations }, count);
	}
);
