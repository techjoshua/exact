import { type AnyComponentInstance, encodeExactMarkerPart, type VNode } from '@exactjs/core';
import { createEffectScope, type EffectScope } from '@exactjs/reactive';
import type { Mounted, Root } from '../../types.js';
import { unmountMany } from '../teardown.js';
import { adoptStaticMounted } from './entry.js';

/** Performs the adopt keyed list children domain operation. */
export function adoptKeyedListChildren(
	root: Root,
	vnodes: VNode[],
	nodes: readonly Node[],
	parentInstance: AnyComponentInstance,
	parentScope: EffectScope,
	startIndex = 0,
	end = nodes.length
): Mounted[] | undefined {
	const mounts: Mounted[] = [];
	let cursor = startIndex;
	for (const vnode of vnodes) {
		const start = nodes[cursor];
		const key = vnode.key;
		if (key === undefined || !(start instanceof Comment) || !isItemMarkerForKey(start.data, key)) {
			unmountMany(mounts);
			return undefined;
		}
		let endIndex = -1;
		for (let index = cursor + 1; index < end; index++) {
			const node = nodes[index];
			if (node instanceof Comment && node.data === `/${start.data}`) {
				endIndex = index;
				break;
			}
		}
		if (endIndex < 0) {
			unmountMany(mounts);
			return undefined;
		}
		const adopted = adoptStaticMounted(
			root,
			vnode,
			nodes,
			cursor + 1,
			parentInstance,
			parentScope,
			endIndex
		);
		if (!adopted || adopted.next !== endIndex) {
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
	if (cursor !== end) {
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
