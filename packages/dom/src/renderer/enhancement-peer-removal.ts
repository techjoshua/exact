import { installEnhancementRouteWatch } from './enhancement-route-watch.js';
import type { AnyComponentInstance } from '@exactjs/core';
import type { Mounted, Root } from '../types.js';
import { withoutEnhancements } from './enhancement-chain.js';
import { findMountedOperation } from './direct-enhancement.js';
import { removePreparedEnhancement } from './prepared-enhancement-removal.js';

/** Removes only a rerouted peer, retaining the shared target and every unchanged component owner. */
export function removeReroutedEnhancementPeer(
	root: Root,
	wrapper: Mounted,
	identity: string,
	parent: AnyComponentInstance | undefined
): boolean {
	const state = wrapper.enhancement!;
	if (state.entries.length < 2) return false;
	const next = state.entries.filter((entry) => entry.identity !== identity);
	if (next.length === state.entries.length) return false;
	if (!wrapper.receivePreparedEnhancements?.(next, withoutEnhancements(state.operation))) {
		let current: Mounted | undefined = wrapper.children[0];
		let predecessor: Mounted | undefined;
		for (const entry of state.entries) {
			const receipt = current?.componentReceipt;
			if (!current || !receipt || receipt.children.length !== 1) return false;
			const supplied = receipt.children[0];
			if (entry.identity === identity) {
				removePreparedEnhancement(
					root,
					wrapper,
					current,
					supplied,
					predecessor?.instance ?? parent,
					'enhancement-target-rerouted'
				);
				if (predecessor)
					predecessor.clientArtifact!.receive(
						predecessor.instance!,
						predecessor.componentReceipt!.props,
						[supplied]
					);
				break;
			}
			predecessor = current;
			current = findMountedOperation(current, supplied);
		}
	}
	wrapper.enhancement = {
		...state,
		entries: next,
		inheritedIdentities: new Set(
			[...state.inheritedIdentities].filter((value) => value !== identity)
		),
		boundaries: new Map([...state.boundaries].filter(([key]) => key !== identity))
	};
	installEnhancementRouteWatch(root, wrapper);
	return true;
}
