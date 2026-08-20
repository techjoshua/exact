import type { AnyComponentInstance, VNode } from '@exactjs/core';
import type { EffectScope } from '@exactjs/reactive';
import type { Mounted, Root } from '../../types.js';
import { countDomWork, withTreeDepth } from '../limits.js';
import { adoptStaticMountedInner } from './tree.js';

/** Adopts one vnode from an SSR-authored DOM range under renderer work limits. */
export function adoptStaticMounted(
	root: Root,
	vnode: VNode,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance,
	parentScope: EffectScope,
	end = nodes.length
): { mounted: Mounted; next: number } | undefined {
	return withTreeDepth(root, () => {
		countDomWork(root);
		return adoptStaticMountedInner(root, vnode, nodes, cursor, parentInstance, parentScope, end);
	});
}
