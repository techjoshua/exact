import { expect, it } from 'vitest';
import { verifyInspectionSessionObservations } from '../../component-composition-corpus/test-support/inspection-session-journey.mjs';
import { installExactDevtoolsRuntime, exactDevtoolsHookSymbol } from './runtime.js';

it('publishes writable observations while retaining private session and lifecycle authority', async () => {
	expect(
		await verifyInspectionSessionObservations({
			installExactDevtoolsRuntime,
			exactDevtoolsHookSymbol
		})
	).toBe(true);
});
