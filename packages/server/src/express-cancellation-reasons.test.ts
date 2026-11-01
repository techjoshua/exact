import { it } from 'vitest';
import { createExpressHandler, defineExactOperationContract } from './index.js';
import { verifyExpressCancellation } from '../../component-composition-corpus/test-support/express-cancellation-journey.js';
it('preserves upstream cancellation before and during Express drain', () =>
	verifyExpressCancellation(() =>
		createExpressHandler({
			contract: {
				version: 1,
				invocations: { probe: defineExactOperationContract('probe') },
				boundaries: {}
			},
			invocations: { probe: async () => ({}) },
			logger: { log() {} }
		})
	));
