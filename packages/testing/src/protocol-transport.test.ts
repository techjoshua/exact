import { it } from 'vitest';
import { handleExactRequest, defineExactOperationContract } from '@exactjs/server';
import { invokeExact, invokeExactBatch } from '../../hydrate/src/invocations.js';
import { linkExactObservationOwner } from '@exactjs/core/framework/inspection-transport';
import { ExactProtocolRecorder } from './protocol.js';
import { createClientServerTransport } from './internal/client-server-transport.js';
import { verifyProtocolObservationTransport } from '../../component-composition-corpus/test-support/protocol-observation-journey.mjs';
it('retains local ownership through native single, batch and streaming transports', async () => {
	await verifyProtocolObservationTransport({
		ExactProtocolRecorder,
		createClientServerTransport,
		handleExactRequest,
		defineExactOperationContract,
		invokeExact,
		invokeExactBatch,
		linkExactObservationOwner
	});
});
