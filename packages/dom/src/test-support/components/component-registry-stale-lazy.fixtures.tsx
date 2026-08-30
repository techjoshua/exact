import {
	recordStaleRegistryLoad,
	recordStaleRegistrySetup,
	waitStaleRegistryGate
} from './component-registry-lazy-control.js';

await waitStaleRegistryGate();
recordStaleRegistryLoad();

/** Compiler-backed stale lazy registry entry. */
export function StaleLazy() {
	recordStaleRegistrySetup();
	return () => <p>lazy</p>;
}
