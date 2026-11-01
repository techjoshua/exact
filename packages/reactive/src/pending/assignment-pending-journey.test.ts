import { it } from 'vitest';
import { reactive } from '../reactive.js';
import { watch } from '../observation.js';
import { flushSync } from '../internal/scheduler.js';
import { createPendingReactiveTransaction } from './pending-state.js';
import {
	assignmentPendingCases,
	verifyAssignmentPending
} from '../../../component-composition-corpus/test-support/assignment-pending-journey.mjs';

it.each(assignmentPendingCases)('shares $selection/$settlement native acceptance', (mode) => {
	verifyAssignmentPending({ reactive, watch, flushSync, createPendingReactiveTransaction }, mode);
});
