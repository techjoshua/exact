import type { AnyComponentInstance, VNode } from '@exactjs/core';
import type { Mounted } from '../../types.js';

/** Detaches descendants from foreign component domains so a replacement can reclaim them. */
export function parkForeignMounts(
	owner: Mounted,
	replacedDomain: AnyComponentInstance['domain'],
	parking: Map<VNode, Array<{ mounted: Mounted; parent: Node }>>,
	ownerSnapshots: Map<Mounted, Mounted[]>,
	fallbackParent: Node
): void {
	ownerSnapshots.set(owner, owner.children);
	const retained: Mounted[] = [];
	for (const child of owner.children) {
		const domain = child.instance?.domain ?? child.vnode.domain;
		if (domain && domain !== replacedDomain) {
			const candidates = parking.get(child.vnode) ?? [];
			candidates.push({ mounted: child, parent: child.dom.parentNode ?? fallbackParent });
			parking.set(child.vnode, candidates);
			continue;
		}
		parkForeignMounts(
			child,
			replacedDomain,
			parking,
			ownerSnapshots,
			child.portalTarget ?? fallbackParent
		);
		retained.push(child);
	}
	owner.children = retained;
}
