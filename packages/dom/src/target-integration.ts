import {
	clearTargetedIntrinsicProps,
	refreshTargetBoundary,
	refreshTargetDependents,
	refreshTargetSubtree,
	updateTargetedIntrinsicProps
} from './renderer/target-contributions.js';
import { mountTargetReceipt, patchTargetReceipt } from './renderer/structural-range-receipt.js';
import {
	registerTargetDomCapability,
	type TargetDomCapability
} from './renderer/target-capability.js';

const capability: TargetDomCapability = Object.freeze({
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
	registerTargetDomCapability(capability);
}
