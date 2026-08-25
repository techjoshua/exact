import {
	clearTargetedIntrinsicProps,
	refreshTargetBoundary,
	refreshTargetDependents,
	refreshTargetSubtree,
	updateTargetedIntrinsicProps
} from './renderer/target-contributions.js';
import {
	registerTargetDomCapability,
	type TargetDomCapability
} from './renderer/target-capability.js';

const capability: TargetDomCapability = Object.freeze({
	refreshSubtree: refreshTargetSubtree,
	refreshDependents: refreshTargetDependents,
	refreshBoundary: refreshTargetBoundary,
	updateIntrinsic: updateTargetedIntrinsicProps,
	clearIntrinsic: clearTargetedIntrinsicProps
});

registerTargetDomCapability(capability);
