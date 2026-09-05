import { registerStructuralBoundaryCapability } from './renderer/structural-capability.js';
import { structuralBoundaryCapability } from './renderer/structural-boundaries.js';

/** Installs native Activity and Suspense operation handling. */
export function installStructuralBoundaryIntegration(): void {
	registerStructuralBoundaryCapability(structuralBoundaryCapability);
}
