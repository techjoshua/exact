/** @vitest-environment jsdom */
import { it } from 'vitest';
import { handleExactRequest, defineExactOperationContract } from '@exactjs/server';
import { ExactProtocolRecorder, mountClientServerTest } from './index.js';
import { verifyProtocolObservationConcurrency } from '../../component-composition-corpus/test-support/protocol-observation-journey.mjs';

it('keeps concurrent, streamed, batched and cleared observations with their request', async () => {
	await verifyProtocolObservationConcurrency(
		{
			ExactProtocolRecorder,
			mountClientServerTest,
			handleExactRequest,
			defineExactOperationContract
		},
		document
	);
});
