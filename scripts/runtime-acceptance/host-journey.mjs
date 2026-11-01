import { nativeRuntimeContracts } from './scenario-contracts.mjs';
import { checkNativeProgress } from './native-scenarios.mjs';
import { checkDispatch } from './dispatch-scenarios.mjs';
import { checkTaskCaptures } from './task-captures.mjs';
import { checkChildInputs } from './child-inputs.mjs';
import { checkValueContracts } from './value-contracts.mjs';
import { checkHydration } from './hydration-scenarios.mjs';
import { checkPendingOwners } from './pending-owner-browser.mjs';

/** Runs the existing per-host sequence and records success only after every owned boundary passes.
 * Server and browser lifetimes stay with the caller. Raw child-input output is retained before its
 * assertions, so later failure cannot turn an unexecuted or rejected boundary into verified evidence.
 */
export async function verifyNativeRuntimeHost({
	origin,
	label,
	runtime,
	control,
	browser,
	clearClient,
	evidence
}) {
	control.reset();
	await checkNativeProgress(origin, control.origin);
	await checkDispatch(origin, control.origin);
	await checkTaskCaptures(origin, clearClient);
	await checkChildInputs(origin, (observation) => {
		evidence.componentChildInputs ??= {};
		evidence.componentChildInputs[label] = observation;
	});
	await checkValueContracts(origin, browser);
	await checkHydration(origin, browser, control.origin);
	await checkPendingOwners(origin, browser);
	evidence.executions.push({
		id: 'native-runtime-' + label,
		tests: nativeRuntimeContracts(runtime),
		status: 'verified'
	});
	console.log(
		`${label}: progress, dispatch/security/serialization, contexts, theme reuse, buffered/streamed SSR and browser hydration passed`
	);
}
