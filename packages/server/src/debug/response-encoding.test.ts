import { it } from 'vitest';
import { exactResponseToFetchResponse } from '../adapters.js';
import { createExactServerDebugRuntime } from './runtime.js';
import { verifyInspectionResponseEncoding } from '../../../component-composition-corpus/test-support/inspection-response-encoding-journey.js';

it('bounds, audits and sends one settled inspection response body', async () => {
	await verifyInspectionResponseEncoding({
		createExactServerDebugRuntime,
		exactResponseToFetchResponse
	});
});
