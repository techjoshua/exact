import { it } from 'vitest';
import { createExactProducedResponse, createExactAsyncProducedResponse } from '../index.js';
import { verifyProducedResponseCancellation } from '../../../component-composition-corpus/test-support/produced-response-cancellation-journey.js';
it('preserves exact produced-body cancellation through scope and demand ownership', () =>
	verifyProducedResponseCancellation({
		createExactProducedResponse,
		createExactAsyncProducedResponse
	}));
