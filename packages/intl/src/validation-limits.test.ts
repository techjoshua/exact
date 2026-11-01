import { expect, it } from 'vitest';
import { validateIntlCatalog, validateIntlRuntimeDescriptor } from './validation.js';
import { verifyIntlValidationLimits } from '../../component-composition-corpus/test-support/intl-protocol-journey.mjs';

it('captures finite validation budgets and bounds normalized published strings', () => {
	expect(verifyIntlValidationLimits({ validateIntlCatalog, validateIntlRuntimeDescriptor })).toBe(
		true
	);
});
