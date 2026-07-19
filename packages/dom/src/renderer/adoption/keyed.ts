import { encodeExactMarkerPart, type ComponentInstance, type VNode } from '@exact/core';
import { createEffectScope, type EffectScope } from '@exact/reactive';
import type { Mounted, Root } from '../../types.js';
import { unmountMany } from '../teardown.js';
import { adoptStaticMounted } from './tree.js';

/** Performs the adopt keyed list children domain operation. */
export function adoptKeyedListChildren(
	root: Root,
	vnodes: VNode[],
	nodes: readonly Node[],
	parentInstance: ComponentInstance<any>,
	parentScope: EffectScope
): Mounted[] | undefined {
	const mounts: Mounted[] = [];
	let cursor = 0;
	for (const vnode of vnodes) {
		const start = nodes[cursor];
		const key = vnode.key;
		if (key === undefined || !(start instanceof Comment) || !isItemMarkerForKey(start.data, key)) {
			unmountMany(mounts);
			return undefined;
		}
		const endIndex = nodes.findIndex(
			(node, index) => index > cursor && node instanceof Comment && node.data === `/${start.data}`
		);
		if (endIndex < 0) {
			unmountMany(mounts);
			return undefined;
		}
		const adopted = adoptStaticMounted(
			root,
			vnode,
			nodes.slice(cursor + 1, endIndex),
			0,
			parentInstance,
			parentScope
		);
		if (!adopted || adopted.next !== endIndex - cursor - 1) {
			unmountMany(adopted ? [adopted.mounted, ...mounts] : mounts);
			return undefined;
		}
		mounts.push({
			vnode,
			dom: start,
			end: nodes[endIndex]!,
			range: 'item',
			scope: createEffectScope(parentScope),
			children: [adopted.mounted]
		});
		cursor = endIndex + 1;
	}
	if (cursor !== nodes.length) {
		unmountMany(mounts);
		return undefined;
	}
	return mounts;
}

/** Reports whether item marker for key. */
export function isItemMarkerForKey(marker: string, key: string): boolean {
	if (!marker.startsWith('exact:item:')) return false;
	const encoded = marker.slice('exact:item:'.length);
	const safe = encodeExactMarkerPart(key);
	return (
		encoded === key ||
		encoded === safe ||
		encoded.endsWith(`:${key}`) ||
		encoded.endsWith(`:${safe}`)
	);
}
