export { readExactHydrationConfig } from './config.js';
export { ExactBuildUnsupportedError, invokeExact, invokeExactBatch } from './invocations.js';
export { hydrateClientIslands } from './islands.js';
export { applyPatches } from './patches.js';
export { createExactClient, getHydrationRoot } from './runtime/client.js';
/** @internal Framework root provider used by renderer integrations. */
export { createExactRoot } from './runtime/root.js';
export { hydrate } from './runtime/hydration.js';
export { getExactProvidedPackageRegistry } from './provided-packages.js';
export type * from './types.js';
export type { ExactProvidedPackageRegistry } from './provided-packages.js';
