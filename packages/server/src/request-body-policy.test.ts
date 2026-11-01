import { expect, it } from 'vitest';
import { handleExactRequest, defineExactOperationContract } from './index.js';
import { readGatewayBody } from './gateway/body.js';
import { verifyRequestBodyPolicy } from '../../component-composition-corpus/test-support/request-body-policy-journey.mjs';

it('warns about large bodies by default and enforces an application-selected cap', async () => {
	expect(
		await verifyRequestBodyPolicy({
			handleExactRequest,
			defineExactOperationContract,
			readGatewayBody
		})
	).toBe(true);
});
