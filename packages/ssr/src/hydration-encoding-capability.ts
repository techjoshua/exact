import { ssrCapabilities } from './render/capability-registry.js';

type HydrationProtocolEncoder = (value: unknown) => unknown;

const capabilityName = 'hydration-protocol-encoder';

/** Installs keyed reactive-state encoding for artifacts that can construct reactive collections. */
export function registerHydrationProtocolEncoder(next: HydrationProtocolEncoder): void {
	ssrCapabilities[capabilityName] = next;
}

/** Encodes compiler-owned plain state or delegates to an installed generic reactive capability. */
export function encodeHydrationProtocolValue(value: unknown): unknown {
	return (
		(ssrCapabilities[capabilityName] as HydrationProtocolEncoder | undefined)?.(value) ?? value
	);
}
