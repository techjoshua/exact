import { it } from 'vitest';
import * as api from './index.js';
import { verifyInspectionQueryData } from '../../component-composition-corpus/test-support/inspection-query-journey.js';
it('validates detached inspection transport data without executing authored accessors', () =>
	verifyInspectionQueryData(api));
