import { it } from 'vitest';
import { createTaskOwnerRecord, executeTaskFrame } from './frame-runtime.js';
import { verifyTaskFrameCancellation } from '../../../component-composition-corpus/test-support/task-progress-cancellation-journey.js';
it('retains prior cancellation when startup finds a disposed owner', () =>
	verifyTaskFrameCancellation({ createTaskOwnerRecord, executeTaskFrame }));
