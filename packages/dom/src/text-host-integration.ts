import { registerTextHostCapability } from './renderer/text-host-capability.js';
import { mountTextHostPresentation } from './renderer/text-host-presentation.js';

/** Installs text presentation for an authored text host or an enhancement-selected intrinsic host. */
export function installTextHostIntegration(): void {
	registerTextHostCapability(mountTextHostPresentation);
}
