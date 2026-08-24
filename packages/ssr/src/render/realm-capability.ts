const realmCapabilitiesKey = Symbol.for('@exactjs/ssr-capabilities/v1');

type CapabilityRealm = typeof globalThis & {
	[realmCapabilitiesKey]?: Map<string, unknown>;
};

/**
 * Publishes a statically selected SSR capability for every copy of the package in this realm.
 * Capabilities contain no request state; request ownership remains in the caller's render context.
 */
export function registerRealmSsrCapability<T>(name: string, capability: T): void {
	realmCapabilities().set(name, capability);
}

/** Reads a statically selected SSR capability installed by any package copy in this realm. */
export function realmSsrCapability<T>(name: string): T | undefined {
	return realmCapabilities().get(name) as T | undefined;
}

/** Returns the realm-owned static capability registry, creating it without exposing enumeration. */
function realmCapabilities(): Map<string, unknown> {
	const realm = globalThis as CapabilityRealm;
	let capabilities = realm[realmCapabilitiesKey];
	if (capabilities) return capabilities;
	capabilities = new Map();
	Object.defineProperty(realm, realmCapabilitiesKey, {
		configurable: true,
		value: capabilities
	});
	return capabilities;
}
