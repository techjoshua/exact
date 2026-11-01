import {
	attemptCleanup,
	createCleanupFailure,
	throwCleanupFailure,
	attachSuppressedCleanupFailure,
	type AnyComponentInstance
} from '@exactjs/core';
import type { ExactPortalReceiptData } from '@exactjs/core/runtime/component-operations';
import { placeMountedBefore } from '../../placement.js';
import type { Mounted, Root } from '../../types.js';
import { mountDetachedChildren } from '../mounting/children.js';
import { portalEventContainer, portalTarget, withEventContainer } from '../portal-routing.js';
import { retainPortalEventContainer } from '../portal-target-lifetime.js';
import { rollbackMountedChildren } from '../teardown.js';
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
		const releasePrevious = mounted.stop;
		mounted.stop = undefined;
		const failure = createCleanupFailure();
		attemptCleanup(failure, () => {
			mounted.children = patchChildren(
				root,
				previousTarget,
				mounted.children,
				[],
				parentInstance,
				mounted.scope
			);
		});
		attemptCleanup(failure, () => releasePrevious?.());
		throwCleanupFailure(failure);
		mounted.portalTarget = nextTarget;
		const eventContainer = portalEventContainer(root, nextTarget);
		mounted.stop = retainPortalEventContainer(root, eventContainer);
		try {
			mounted.children = withEventContainer(root, eventContainer, () =>
				mountDetachedChildren(
					root,
					[...receipt.children],
					parentInstance,
					mounted.scope,
					nextTarget
				)
			);
			for (const child of mounted.children) placeMountedBefore(root, nextTarget, child, null);
		} catch (error) {
			const children = mounted.children;
			mounted.children = [];
			const release = mounted.stop;
			mounted.stop = undefined;
			rollbackMountedChildren(children, nextTarget, error);
			try {
				release?.();
			} catch (cleanup) {
				attachSuppressedCleanupFailure(error, cleanup);
			}
			throw error;
		}
		return;
	}
	const eventContainer = portalEventContainer(root, nextTarget);
	mounted.stop ??= retainPortalEventContainer(root, eventContainer);
	mounted.children = withEventContainer(root, eventContainer, () =>
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
