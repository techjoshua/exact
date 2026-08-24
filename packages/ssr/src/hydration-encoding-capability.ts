import { realmSsrCapability, registerRealmSsrCapability } from './render/realm-capability.js';

type HydrationProtocolEncoder = (value: unknown) => unknown;

const capabilityName = 'hydration-protocol-encoder';

/** Installs keyed reactive-state encoding for artifacts that can construct reactive collections. */
export function registerHydrationProtocolEncoder(next: HydrationProtocolEncoder): void {
	registerRealmSsrCapability(capabilityName, next);
}

/** Encodes compiler-owned plain state or delegates to an installed generic reactive capability. */
export function encodeHydrationProtocolValue(value: unknown): unknown {
	return realmSsrCapability<HydrationProtocolEncoder>(capabilityName)?.(value) ?? value;
}
