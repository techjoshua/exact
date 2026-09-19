import type { Child } from '@exactjs/core';
import {
	createCompiledFragmentPresentation,
	createCompiledTargetContributions
} from '@exactjs/core/runtime/component-abi';
import type {
	FragmentContribution,
	FragmentPresentationHost
} from '@exactjs/core/framework/render-structure';

/**
 * Lowers an already prepared fragment-host plan to existing renderer operations for the prototype.
 * The target is placed once. Each owner keeps a distinct contribution record on its shared host.
 * This does not implement new compiler syntax or change the released Target receipt semantics.
 */
export function prototypeFragmentPlacement(
	target: Child,
	hosts: readonly FragmentPresentationHost[]
): Child {
	return createCompiledFragmentPresentation(
		target,
		hosts.map((host) => ({
			identity: host.identity,
			tag: host.tag,
			contributions: host.owners.map((owner) => ({ identity: owner.owner, props: owner.props }))
		}))
	);
}

/** Places an already resolved intrinsic with separate outer-to-inner prop contribution owners. */
export function prototypeIntrinsicPlacement(
	target: Child,
	owners: readonly FragmentContribution[]
): Child {
	return createCompiledTargetContributions(
		owners.map((owner) => ({
			identity: owner.owner,
			props: owner.props
		})),
		target
	);
}
