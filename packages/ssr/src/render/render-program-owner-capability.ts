import type { AnyComponentInstance } from '@exactjs/core';
import { realmSsrCapabilities } from './realm-capability.js';

type RenderProgramOwnerRunner = <T>(owner: AnyComponentInstance, work: () => T) => T;

const capabilityName = 'render-program-owner';

/** Installs durable owner re-entry for generic render-program fallbacks. */
export function registerRenderProgramOwnerRunner(next: RenderProgramOwnerRunner): void {
	realmSsrCapabilities[capabilityName] = next;
}

/** Re-enters a durable owner only for artifacts that explicitly installed that capability. */
export function withRenderProgramOwner<T>(
	owner: AnyComponentInstance | undefined,
	work: () => T
): T {
	if (!owner) return work();
	const runner = realmSsrCapabilities[capabilityName] as RenderProgramOwnerRunner | undefined;
	if (!runner)
		throw new TypeError('Owned SSR render-program fallback requires generic component capability');
	return runner(owner, work);
}
