import { it } from 'vitest';
import { dispatchExactBatch } from './streaming.js';
import { readBody } from './protocol.js';
import { createProgressStream } from './progress/stream.js';
import { verifyServerStreamCancellation } from '../../component-composition-corpus/test-support/server-stream-cancellation-journey.js';
it('preserves request and progress cancellation reasons through producer cleanup', () =>
	verifyServerStreamCancellation({ readBody, createProgressStream, dispatchExactBatch }));
