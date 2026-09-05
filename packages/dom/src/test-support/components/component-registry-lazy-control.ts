let concurrentGate: Promise<void> = Promise.resolve();
let releaseConcurrentGate: () => void = () => undefined;
let concurrentLoads = 0;
let staleGate: Promise<void> = Promise.resolve();
let releaseStaleGate: () => void = () => undefined;
let staleLoads = 0;
let staleSetups = 0;

/** Starts one independently controlled concurrent lazy module evaluation. */
export function resetConcurrentRegistryFixture() {
	concurrentLoads = 0;
	concurrentGate = new Promise<void>((resolve) => {
		releaseConcurrentGate = resolve;
	});
}

/** Waits for the concurrent lazy module test gate. */
export function waitConcurrentRegistryGate() {
	return concurrentGate;
}

/** Records one concurrent lazy module evaluation. */
export function recordConcurrentRegistryLoad() {
	concurrentLoads++;
}

/** Releases the concurrent lazy fixture loader. */
export function releaseConcurrentRegistryFixture() {
	releaseConcurrentGate();
}

/** Reports concurrent lazy module evaluations. */
export function concurrentRegistryLoadCount() {
	return concurrentLoads;
}

/** Starts one independently controlled stale lazy module evaluation. */
export function resetStaleRegistryFixture() {
	staleLoads = 0;
	staleSetups = 0;
	staleGate = new Promise<void>((resolve) => {
		releaseStaleGate = resolve;
	});
}

/** Waits for the stale lazy module test gate. */
export function waitStaleRegistryGate() {
	return staleGate;
}

/** Records one stale lazy module evaluation. */
export function recordStaleRegistryLoad() {
	staleLoads++;
}

/** Records one committed stale-lazy component setup. */
export function recordStaleRegistrySetup() {
	staleSetups++;
}

/** Releases the stale lazy fixture loader. */
export function releaseStaleRegistryFixture() {
	releaseStaleGate();
}

/** Reports stale lazy module evaluations. */
export function staleRegistryLoadCount() {
	return staleLoads;
}

/** Reports committed stale-lazy component setups. */
export function staleRegistrySetupCount() {
	return staleSetups;
}
