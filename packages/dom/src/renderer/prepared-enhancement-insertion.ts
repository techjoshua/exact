import type { AnyComponentInstance, Child } from '@exactjs/core';
import { placeMountedBefore, lastMountedNode } from '../placement.js';
import type { Mounted, Root } from '../types.js';
import { mountComponentReceipt } from './mounting/native-component-artifact.js';
import { readCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { retainMountedOperation } from './mounting/native-operation-target.js';

/** Locates the retained logical placement without examining physical DOM descendants. */
function locate(
	owner: Mounted,
	operation: Child
): { owner: Mounted; index: number; mounted: Mounted } | undefined {
	for (let index = 0; index < owner.children.length; index++) {
		const mounted = owner.children[index]!;
		if (mounted.operation === operation) return { owner, index, mounted };
		const nested = locate(mounted, operation);
		if (nested) return nested;
	}
	return undefined;
}

/**
 * Inserts one prepared owner around its retained supplied range. Parking transfers the existing
 * component and effect ownership at commit; neither the supplied child nor surviving peers execute
 * again. The caller publishes the changed parent child receipt in the same synchronous transaction.
 */
export function insertPreparedEnhancement(
	root: Root,
	boundary: Mounted,
	operation: Child,
	supplied: Child,
	parent: AnyComponentInstance | undefined,
	pending: NonNullable<Root['preparedComponents']>
): void {
	const location = locate(boundary, supplied);
	if (!location) throw new Error('Prepared enhancement lost its supplied placement');
	const parentNode = location.mounted.dom.parentNode;
	if (!parentNode) throw new Error('Prepared enhancement is not attached');
	const cursor = lastMountedNode(location.mounted).nextSibling;
	const previousParking = root.replacementParking;
	const previousPrepared = root.preparedComponents;
	const parking = {
		mounts: new Map([[supplied, [{ mounted: location.mounted, parent: parentNode }]]]),
		commits: [] as Array<() => void>
	};
	root.replacementParking = parking;
	root.preparedComponents = pending;
	try {
		const inserted = mountComponentReceipt(
			root,
			readCompiledComponentReceipt(operation)!,
			parent,
			location.owner.scope,
			parentNode
		);
		retainMountedOperation(inserted, operation);
		if (parking.mounts.size)
			throw new Error('Prepared enhancement did not retain its supplied placement');
		for (const commit of parking.commits) commit();
		location.owner.children[location.index] = inserted;
		placeMountedBefore(root, parentNode, inserted, cursor);
	} finally {
		root.replacementParking = previousParking;
		root.preparedComponents = previousPrepared;
	}
}
