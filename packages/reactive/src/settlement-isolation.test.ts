import { expect, it } from 'vitest';
import { afterReactiveSettlement } from './framework/settlement.js';
import { verifySettlementIsolation } from '../../component-composition-corpus/test-support/reactive-settlement-journey.mjs';
it('attempts each queued settlement before rethrowing its first failure', async () => {
	expect(await verifySettlementIsolation({ afterReactiveSettlement })).toBe(true);
});
