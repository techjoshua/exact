import type { AnyComponentInstance } from '@exactjs/core';
import type { ExactPortalReceiptData } from '@exactjs/core/runtime/component-operations';
import { placeMountedBefore } from '../../placement.js';
import type { Mounted, Root } from '../../types.js';
import { mountDetachedChildren } from '../mounting/children.js';
import { portalEventContainer, portalTarget, withEventContainer } from '../portal-routing.js';
import { patchChildren } from './children.js';

/** Updates a focused portal while preserving its logical owner and physical target range. */
export function patchPortalReceipt(
	root: Root,
	mounted: Mounted,
	receipt: ExactPortalReceiptData,
	parentInstance: AnyComponentInstance | undefined
): void {
	const previousTarget = mounted.portalTarget ?? portalTarget(mounted.portalReceipt!);
	const nextTarget = portalTarget(receipt);
	mounted.portalReceipt = receipt;
	if (previousTarget !== nextTarget) {
		mounted.children = patchChildren(
			root,
			previousTarget,
			mounted.children,
			[],
			parentInstance,
			mounted.scope
		);
		mounted.portalTarget = nextTarget;
		const eventContainer = portalEventContainer(root, nextTarget);
		if (eventContainer === nextTarget) root.portalTargets.add(nextTarget);
		mounted.children = withEventContainer(root, eventContainer, () =>
			mountDetachedChildren(root, [...receipt.children], parentInstance, mounted.scope, nextTarget)
		);
		for (const child of mounted.children) placeMountedBefore(root, nextTarget, child, null);
		return;
	}
	mounted.children = withEventContainer(root, portalEventContainer(root, nextTarget), () =>
		patchChildren(
			root,
			nextTarget,
			mounted.children,
			[...receipt.children],
			parentInstance,
			mounted.scope
		)
	);
}
