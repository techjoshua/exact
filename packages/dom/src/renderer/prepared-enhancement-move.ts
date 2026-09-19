import type { AnyComponentInstance, Child } from '@exactjs/core';
import { reparentComponentInstance } from '@exactjs/core/runtime/render-operations';
import { transferEffectScope } from '@exactjs/reactive/framework/runtime';
import { lastMountedNode, mountedDomNodes, placeMountedBefore } from '../placement.js';
import type { Mounted, Root } from '../types.js';
import type { PreparedOwner } from './prepared-fragment-owner.js';

type Location = { owner: Mounted; index: number; mounted: Mounted };
function locate(owner: Mounted, match: (child: Mounted) => boolean): Location | undefined {
	for (const [index, mounted] of owner.children.entries()) {
		if (match(mounted)) return { owner, index, mounted };
		const nested = locate(mounted, match);
		if (nested) return nested;
	}
	return undefined;
}

/**
 * Moves a transparent peer around another retained range without reconstructing either owner.
 * The supplied range leaves the old scope before the peer is moved, preventing parent cycles.
 * Callers publish every changed child receipt together before reactive reconciliation resumes.
 */
export function movePreparedEnhancement(
	root: Root,
	boundary: Mounted,
	peer: PreparedOwner,
	nextChild: Child,
	oldParent: AnyComponentInstance | undefined,
	nextParent: AnyComponentInstance | undefined
): void {
	const outer = locate(boundary, (child) => child === peer.mounted);
	const inner = locate(peer.mounted, (child) => child.operation === peer.child);
	if (!outer || !inner) throw new Error('Moving enhancement lost its supplied placement');
	const oldHost = peer.mounted.dom.parentNode;
	if (!oldHost) throw new Error('Moving enhancement is not attached');
	inner.owner.children.splice(inner.index, 1);
	transferEffectScope(inner.mounted.scope, outer.owner.scope);
	if (inner.mounted.instance) reparentComponentInstance(inner.mounted.instance, oldParent);
	outer.owner.children[outer.index] = inner.mounted;
	placeMountedBefore(root, oldHost, inner.mounted, peer.mounted.dom);
	const detached = peer.mounted.dom.ownerDocument!.createDocumentFragment();
	for (const node of mountedDomNodes(peer.mounted)) detached.append(node);
	transferEffectScope(peer.mounted.scope, boundary.scope);
	reparentComponentInstance(peer.instance, undefined);
	const destination = locate(boundary, (child) => child.operation === nextChild);
	if (!destination) throw new Error('Moving enhancement lost its destination');
	const host = destination.mounted.dom.parentNode!;
	const cursor = lastMountedNode(destination.mounted).nextSibling;
	transferEffectScope(peer.mounted.scope, destination.owner.scope);
	reparentComponentInstance(peer.instance, nextParent);
	transferEffectScope(destination.mounted.scope, inner.owner.scope);
	if (destination.mounted.instance)
		reparentComponentInstance(destination.mounted.instance, peer.instance);
	inner.owner.children.splice(inner.index, 0, destination.mounted);
	destination.owner.children[destination.index] = peer.mounted;
	placeMountedBefore(root, host, peer.mounted, cursor);
}
