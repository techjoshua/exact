/** Runs shared clock ownership and timestamp controls through source or built packages. */
export function verifyTimeLifecycle(api: {
	createTimeActivation: typeof import('../../time/src/activation.js').createTimeActivation;
	inspectTimeClock: typeof import('../../time/src/testing.js').inspectTimeClock;
}): Promise<true>;

/** Executes captured input, readonly observation and numeric progress controls. */
export function verifyTimeValues(api: {
	createTimeActivation: typeof import('../../time/src/activation.js').createTimeActivation;
	validateTimeChangePlan: typeof import('../../time/src/plan.js').validateTimeChangePlan;
	timeInstant: typeof import('../../time/src/clocks.js').timeInstant;
	wallTimeClock: typeof import('../../time/src/clocks.js').wallTimeClock;
	createManualTimeClock: typeof import('../../time/src/testing.js').createManualTimeClock;
}): Promise<void>;

/** Checks wake failure isolation, stale callback fencing, reentrancy and next-timer progress. */
export function verifyTimeWakeFailures(api: {
	createTimeActivation: typeof import('../../time/src/activation.js').createTimeActivation;
}): Promise<true>;

/** Checks disabled and replaced timers, cancellation failures and reentrant scheduling disposal. */
export function verifyTimeTimerRetirement(api: {
	createTimeActivation: typeof import('../../time/src/activation.js').createTimeActivation;
}): Promise<true>;
