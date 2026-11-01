import { it } from 'vitest';
import { invokeExact, invokeExactBatch } from '../invocations.js';
import { verifyJsonResponseOwnership } from '../../../component-composition-corpus/test-support/response-reader-journey.mjs';

it('validates JSON-only response values before serialized byte accounting invokes authored code', async () => {
	await verifyJsonResponseOwnership({ invokeExact, invokeExactBatch });
});
