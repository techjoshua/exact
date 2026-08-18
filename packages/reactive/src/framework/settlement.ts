/**
 * Runs framework reconciliation after the current reactive scheduler cycle reaches a stable state.
 * Repeated requests for the same callback are coalesced, and requests made while settlement is
 * running are deferred to a later microtask rather than extending the cycle being settled.
 */
export function afterReactiveSettlement(reconcile: () => void): void {
	requestSchedulerSettlement(reconcile);
}
import { requestSchedulerSettlement } from '../internal/scheduler.js';
