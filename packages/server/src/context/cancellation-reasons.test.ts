import { it } from 'vitest';
import { createExactContextRuntime, runWithExactRequestScope } from '../index.js';
import { verifyServerContextCancellation } from '../../../component-composition-corpus/test-support/server-context-cancellation-journey.js';
it('retains exact request and stream cancellation reasons', () =>
	verifyServerContextCancellation({ createExactContextRuntime, runWithExactRequestScope }));
