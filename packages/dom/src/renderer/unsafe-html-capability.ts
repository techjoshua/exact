import type { Mounted, Root } from '../types.js';

/** Optional unsafe-HTML range renderer installed only for artifacts that use the capability. */
export type UnsafeHtmlDomCapability = Readonly<{
	assertAllowed(root: Root): void;
	bind(root: Root, mounted: Mounted, value: unknown, adopted?: boolean): void;
}>;

let unsafeHtmlDomCapability: UnsafeHtmlDomCapability | undefined;

/** Installs unsafe-HTML range rendering for the current DOM runtime instance. */
export function registerUnsafeHtmlDomCapability(capability: UnsafeHtmlDomCapability): void {
	if (unsafeHtmlDomCapability && unsafeHtmlDomCapability !== capability)
		throw new Error('Conflicting eXact unsafe-HTML DOM capability integration');
	unsafeHtmlDomCapability = capability;
}

/** Requires the unsafe-HTML range renderer selected for this artifact. */
export function requireUnsafeHtmlDomCapability(): UnsafeHtmlDomCapability {
	if (!unsafeHtmlDomCapability)
		throw new Error(
			'unsafeHtml() rendering is unavailable because this artifact did not include the DOM capability'
		);
	return unsafeHtmlDomCapability;
}
