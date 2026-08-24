import type { AnyComponentInstance } from '@exactjs/core';
import { realmSsrCapability, registerRealmSsrCapability } from './realm-capability.js';

type RenderProgramOwnerRunner = <T>(owner: AnyComponentInstance, work: () => T) => T;

const capabilityName = 'render-program-owner';

/** Installs durable owner re-entry for generic render-program fallbacks. */
export function registerRenderProgramOwnerRunner(next: RenderProgramOwnerRunner): void {
	registerRealmSsrCapability(capabilityName, next);
}

/** Re-enters a durable owner only for artifacts that explicitly installed that capability. */
export function withRenderProgramOwner<T>(
	owner: AnyComponentInstance | undefined,
	work: () => T
): T {
	if (!owner) return work();
	const runner = realmSsrCapability<RenderProgramOwnerRunner>(capabilityName);
	if (!runner)
		throw new TypeError('Owned SSR render-program fallback requires generic component capability');
	return runner(owner, work);
}
