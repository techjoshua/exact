import { it } from 'vitest';
import { createStaticHandler } from './modern.js';
import { verifyStaticQueryCancellation } from '../../../packages/component-composition-corpus/test-support/router-request-cancellation-journey.js';
it('fences initial and pending static request cancellation across read and mutation queries', () =>
	verifyStaticQueryCancellation({ createStaticHandler }));
