import { releaseMountedRange } from './retained-release.js';
import type { AnyComponentInstance, Child, StructuralReleaseReason } from '@exactjs/core';
import { reparentComponentInstance } from '@exactjs/core/runtime/render-operations';
import { transferEffectScope } from '@exactjs/reactive/framework/runtime';
import { placeMountedBefore } from '../placement.js';
import type { Mounted, Root } from '../types.js';
import { disposeMounted } from './teardown.js';

type Location = { owner: Mounted; index: number; mounted: Mounted };

/** Finds the ownership edge for one supplied child without examining physical DOM descendants. */
function locate(owner: Mounted, match: (child: Mounted) => boolean): Location | undefined {
	for (let index = 0; index < owner.children.length; index++) {
		const mounted = owner.children[index]!;
		if (match(mounted)) return { owner, index, mounted };
		const nested = locate(mounted, match);
		if (nested) return nested;
	}
	return undefined;
}

/**
 * Removes one transparent prepared owner while transferring its supplied range before teardown.
 * The caller updates surviving prop receipts in the same synchronous transaction. Existing hosts,
 * children, input values, and inner component instances stay owned and are never remounted.
 */
export function removePreparedEnhancement(
	root: Root,
	boundary: Mounted,
	departed: Mounted,
	supplied: Child,
	parentInstance: AnyComponentInstance | undefined,
	reason?: StructuralReleaseReason
): void {
	const outer = locate(boundary, (child) => child === departed);
	const inner = locate(departed, (child) => child.operation === supplied);
	if (!outer || !inner) throw new Error('Prepared enhancement lost its supplied placement');
	const parentNode = departed.dom.parentNode;
	if (!parentNode) throw new Error('Prepared enhancement is not attached');
	inner.owner.children.splice(inner.index, 1);
	transferEffectScope(inner.mounted.scope, outer.owner.scope);
	if (inner.mounted.instance) reparentComponentInstance(inner.mounted.instance, parentInstance);
	placeMountedBefore(root, parentNode, inner.mounted, departed.dom);
	outer.owner.children[outer.index] = inner.mounted;
	if (!reason || !releaseMountedRange(root, parentNode, departed, reason))
		disposeMounted(parentNode, departed);
}
