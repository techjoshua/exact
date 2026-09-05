import type { AnyComponentInstance, Child } from '@exactjs/core';
import type { Mounted, Root } from '../../types.js';

/** One scoped replacement transaction that can reclaim foreign-domain descendants. */
export type ReplacementParking = NonNullable<Root['replacementParking']>;

/** Parks every descendant outside the replaced component's immutable domain. */
export function createForeignReplacementParking(
	owner: Mounted,
	fallbackParent: Node
): ReplacementParking {
	const parking: ReplacementParking = {
		mounts: new Map(),
		commits: []
	};
	if (owner.instance)
		parkForeignMounts(owner, owner.instance.domain, parking.mounts, fallbackParent);
	return parking;
}

/** Detaches descendants from foreign component domains so a replacement can reclaim them. */
export function parkForeignMounts(
	owner: Mounted,
	replacedDomain: AnyComponentInstance['domain'],
	parking: Map<Child, Array<{ mounted: Mounted; parent: Node }>>,
	fallbackParent: Node
): void {
	const retained: Mounted[] = [];
	for (const child of owner.children) {
		const domain = child.instance?.domain ?? child.componentReceipt?.domain;
		const operation = child.operation ?? (child.componentReceipt as unknown as Child | undefined);
		if (operation && domain && domain !== replacedDomain) {
			const candidates = parking.get(operation) ?? [];
			candidates.push({ mounted: child, parent: child.dom.parentNode ?? fallbackParent });
			parking.set(operation, candidates);
			continue;
		}
		parkForeignMounts(child, replacedDomain, parking, child.portalTarget ?? fallbackParent);
		retained.push(child);
	}
	owner.children = retained;
}
