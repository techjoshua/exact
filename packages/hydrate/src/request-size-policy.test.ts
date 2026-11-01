import { expect, it } from 'vitest';
import { defineExactOperationContract, handleExactRequest } from '../../server/src/index.js';
import { verifyClientRequestBodyPolicy } from '../../component-composition-corpus/test-support/request-body-policy-journey.mjs';
import { invokeExact, invokeExactBatch } from './invocations.js';

it('applies application-owned byte caps consistently before single and batched server dispatch', async () => {
	expect(
		await verifyClientRequestBodyPolicy({
			invokeExact,
			invokeExactBatch,
			handleExactRequest,
			defineExactOperationContract
		})
	).toBe(true);
});
