import { it } from 'vitest';
import { parseExactInspectionRequest, parseExactInspectionSubscription } from './query.js';
import { verifyInspectionQueryLimits } from '../../component-composition-corpus/test-support/inspection-query-limits-journey.js';
it('enforces configured query budgets, including absent optional fields and valid boundaries', () =>
	verifyInspectionQueryLimits({ parseExactInspectionRequest, parseExactInspectionSubscription }));
