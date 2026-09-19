import { registerSuppliedPlacementCapability } from './renderer/supplied-placement-capability.js';
import { suppliedPlacementCapability } from './renderer/supplied-placement.js';
import { installTextHostIntegration } from './text-host-integration.js';
import {
	clearTargetedIntrinsicProps,
	refreshTargetBoundary,
	refreshTargetDependents,
	refreshTargetSubtree,
	updateTargetedIntrinsicProps
} from './renderer/target-contributions.js';
import { mountTargetReceipt, patchTargetReceipt } from './renderer/structural-range-receipt.js';
import { patchFragmentPresentation } from './renderer/fragment-presentation.js';
import {
	registerTargetDomCapability,
	type TargetDomCapability
} from './renderer/target-capability.js';

const capability: TargetDomCapability = Object.freeze({
	patchFragmentPresentation,
	mount: mountTargetReceipt,
	patch: patchTargetReceipt,
	refreshSubtree: refreshTargetSubtree,
	refreshDependents: refreshTargetDependents,
	refreshBoundary: refreshTargetBoundary,
	updateIntrinsic: updateTargetedIntrinsicProps,
	clearIntrinsic: clearTargetedIntrinsicProps
});

/** Installs native Target operation handling. */
export function installTargetIntegration(): void {
	installTextHostIntegration();
	registerSuppliedPlacementCapability(suppliedPlacementCapability);
	registerTargetDomCapability(capability);
}
