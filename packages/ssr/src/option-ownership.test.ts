import { expect, it } from 'vitest';
import { createCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-operations';
import {
	renderToString,
	renderToHydratableString,
	renderToStream,
	renderToDocumentStream,
	renderToProgressiveHtmlStream
} from './index.js';
import {
	verifySsrOptionOwnership,
	verifySsrOutputPolicy,
	verifySsrTraversalPolicy
} from '../../component-composition-corpus/test-support/ssr-option-ownership-journey.mjs';
it('enforces inherited output budgets in every public SSR output mode', async () => {
	expect(
		await verifySsrOptionOwnership({
			intrinsic: createCompiledIntrinsicReceipt,
			renderToString,
			renderToHydratableString,
			renderToStream,
			renderToDocumentStream,
			renderToProgressiveHtmlStream
		})
	).toBe(true);
});

it('leaves total output size to application policy in every public SSR mode', async () => {
	expect(
		await verifySsrOutputPolicy({
			intrinsic: createCompiledIntrinsicReceipt,
			renderToString,
			renderToHydratableString,
			renderToStream,
			renderToDocumentStream,
			renderToProgressiveHtmlStream
		})
	).toBe(true);
});

it('leaves finite traversal size to application policy while honoring an explicit node cap', async () => {
	expect(
		await verifySsrTraversalPolicy({ intrinsic: createCompiledIntrinsicReceipt, renderToString })
	).toBe(true);
});
