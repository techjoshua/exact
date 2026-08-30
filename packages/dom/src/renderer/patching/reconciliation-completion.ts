import type { AnyComponentInstance } from '@exactjs/core';
import type { Mounted, Root } from '../../types.js';
import { refreshComponentRoot } from '../component-roots.js';
import { refreshTargetDependents } from '../target-capability.js';

/** Publishes ownership-dependent work after target-local child reconciliation. */
export function completeChildReconciliation(
	root: Root,
	parentInstance: AnyComponentInstance | undefined,
	structuralOwner: Mounted | undefined
): void {
	if (structuralOwner) refreshTargetDependents(root, structuralOwner);
	if (parentInstance) refreshComponentRoot(parentInstance);
	if (!root.enhancementReconciliationDepth) root.reconcileEnhancements?.();
}
