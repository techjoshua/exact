import {
	recordConcurrentRegistryLoad,
	waitConcurrentRegistryGate
} from './component-registry-lazy-control.js';

await waitConcurrentRegistryGate();
recordConcurrentRegistryLoad();

/** Compiler-backed concurrent lazy registry entry. */
export function ConcurrentLazy() {
	return () => <p>loaded</p>;
}
