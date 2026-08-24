import type { AnyComponentInstance } from '@exactjs/core';

type RenderProgramOwnerRunner = <T>(owner: AnyComponentInstance, work: () => T) => T;

let runner: RenderProgramOwnerRunner | undefined;

/** Installs durable owner re-entry for generic render-program fallbacks. */
export function registerRenderProgramOwnerRunner(next: RenderProgramOwnerRunner): void {
	runner = next;
}

/** Re-enters a durable owner only for artifacts that explicitly installed that capability. */
export function withRenderProgramOwner<T>(
	owner: AnyComponentInstance | undefined,
	work: () => T
): T {
	if (!owner) return work();
	if (!runner)
		throw new TypeError('Owned SSR render-program fallback requires generic component capability');
	return runner(owner, work);
}
