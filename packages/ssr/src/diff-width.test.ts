import { it } from 'vitest';
import { diffBoundaryHtml } from './diff.js';
import { verifyWideStyleDiff } from '../../component-composition-corpus/test-support/wide-runtime-collections.mjs';
it.each([3, 140_000])('preserves style patch fallback for %i declarations', (count) => {
	verifyWideStyleDiff({ diffBoundaryHtml }, count);
});
