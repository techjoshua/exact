import { expect, it } from 'vitest';
import { defineConfig } from './index.js';
import { verifyAuthoredConfigValues } from '../../component-composition-corpus/test-support/authored-config-journey.mjs';

it('retains caller-owned values and executable callback state during validation', () => {
	expect(verifyAuthoredConfigValues({ defineConfig })).toBe(true);
});
