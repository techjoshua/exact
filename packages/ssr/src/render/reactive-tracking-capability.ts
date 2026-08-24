import { realmSsrCapability, registerRealmSsrCapability } from './realm-capability.js';

type ReactivePeek = <T>(work: () => T) => T;

const capabilityName = 'reactive-peek';

/** Installs dependency-tracking suppression for generic reactive server component snapshots. */
export function registerSsrReactivePeek(next: ReactivePeek): void {
	registerRealmSsrCapability(capabilityName, next);
}

/** Reads plain compiler-owned props directly or suppresses tracking in a generic reactive lane. */
export function withSsrReactivePeek<T>(work: () => T): T {
	return realmSsrCapability<ReactivePeek>(capabilityName)?.(work) ?? work();
}
