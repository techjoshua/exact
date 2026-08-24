const realmCapabilitiesKey = Symbol.for('@exactjs/ssr-capabilities/v1');

type CapabilityRealm = typeof globalThis & {
	[realmCapabilitiesKey]?: Record<string, unknown>;
};

/**
 * Static SSR capabilities shared by every copy of the package in this realm. Capabilities contain
 * no request state; request ownership remains in the caller's render context.
 */
export const realmSsrCapabilities: Record<string, unknown> = (() => {
	const realm = globalThis as CapabilityRealm;
	if (realm[realmCapabilitiesKey]) return realm[realmCapabilitiesKey];
	const capabilities: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
	Object.defineProperty(realm, realmCapabilitiesKey, { value: capabilities });
	return capabilities;
})();
