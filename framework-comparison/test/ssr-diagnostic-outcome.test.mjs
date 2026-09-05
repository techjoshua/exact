import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { captureSsrDiagnostic } from '../src/ssr-diagnostic-outcome.mjs';

describe('SSR diagnostic outcome', () => {
	it('preserves a successful attribution population', async () => {
		assert.deepEqual(await captureSsrDiagnostic(async () => ({ exact: [1, 2] })), {
			supported: true,
			value: { exact: [1, 2] }
		});
	});

	it('retains nested lane context without publishing partial timings', async () => {
		const result = await captureSsrDiagnostic(async () => {
			throw new Error('exact service-phase-64 failed during round 17/50', {
				cause: new Error('SSR request failed with 500: Unable to connect')
			});
		});

		assert.deepEqual(result, {
			supported: false,
			reason:
				'exact service-phase-64 failed during round 17/50: SSR request failed with 500: Unable to connect'
		});
	});
});
