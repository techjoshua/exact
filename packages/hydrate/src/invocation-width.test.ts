/** @vitest-environment jsdom */
import { it } from 'vitest';
import { createExactClient } from './index.js';
import { verifyWideHydrationOrdering } from '../../component-composition-corpus/test-support/wide-runtime-collections.mjs';
it.each([3, 140_000])(
	'dispatches subsequent continuations with %i boundary keys',
	async (count) => {
		await verifyWideHydrationOrdering({ createExactClient }, document, count);
	}
);
