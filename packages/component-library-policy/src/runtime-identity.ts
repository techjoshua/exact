import type { ExactComponentAuthorizationManifest } from './contracts.js';

/** Projects the only component-authorization fields permitted to cross into runtime artifacts. */
export function exactComponentAuthorizationIdentity(
	manifest: ExactComponentAuthorizationManifest
): Readonly<{ protocol: 1; buildKey: string; fingerprint: string }> {
	return Object.freeze({
		protocol: manifest.protocol,
		buildKey: manifest.buildKey,
		fingerprint: manifest.fingerprint
	});
}
