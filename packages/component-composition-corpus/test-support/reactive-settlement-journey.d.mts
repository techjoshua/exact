import type { afterReactiveSettlement } from '../../reactive/src/framework/settlement.js';
/** Checks failure isolation and progress through the framework settlement entry. */
export function verifySettlementIsolation(api: {
	afterReactiveSettlement: typeof afterReactiveSettlement;
}): Promise<true>;
