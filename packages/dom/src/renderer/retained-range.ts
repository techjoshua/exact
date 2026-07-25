import type { Mounted, Root } from '../types.js';
import { mountedDomNodes, placeMountedBefore } from '../placement.js';

/** One physically contiguous segment within a retained logical subtree. */
export type RetainedSegment = {
	readonly mounts: readonly Mounted[];
	readonly parent: Node;
	readonly before: Node | null;
	readonly fragment: DocumentFragment;
};

/** Owns disconnected DOM segments for one logical mounted subtree. */
export type RetainedMountedRanges = {
	readonly segments: readonly RetainedSegment[];
	detached: boolean;
};

/**
 * Detaches mounted subtrees without releasing their DOM, reactive scopes, handlers, or refs.
 *
 * Portal content is retained as a separate physical segment while remaining part of the same
 * logical operation. The returned handle is single-owner state and must be restored or disposed
 * with the mounted subtree.
 */
export function detachMountedRanges(mounts: readonly Mounted[]): RetainedMountedRanges {
	const groups: Array<{ mounts: readonly Mounted[]; parent: Node }> = [];
	if (mounts.length) groups.push({ mounts, parent: commonParent(mounts) });
	collectPortalGroups(mounts, groups);

	const segments = groups.map(({ mounts: groupedMounts, parent }) =>
		detachSegment(groupedMounts, parent)
	);
	return { segments, detached: true };
}

/**
 * Restores every physical segment captured by {@link detachMountedRanges}.
 *
 * Existing cursors are honored when still connected to the original parent. A removed cursor
 * falls back to the end of that parent, preserving ownership without inserting into another tree.
 */
export function restoreMountedRanges(root: Root, retained: RetainedMountedRanges): void {
	if (!retained.detached) return;
	for (const segment of retained.segments) {
		const before = segment.before?.parentNode === segment.parent ? segment.before : null;
		for (const mounted of segment.mounts) placeMountedBefore(root, segment.parent, mounted, before);
	}
	retained.detached = false;
}

function detachSegment(mounts: readonly Mounted[], parent: Node): RetainedSegment {
	const nodes = mounts.flatMap((mounted) => mountedDomNodes(mounted));
	assertContiguousRange(nodes, parent);
	const before = nodes[nodes.length - 1]?.nextSibling ?? null;
	const document = parent.ownerDocument ?? (parent as Document);
	const fragment = document.createDocumentFragment();
	for (const node of nodes) fragment.appendChild(node);
	return { mounts, parent, before, fragment };
}

function commonParent(mounts: readonly Mounted[]): Node {
	const parent = mounts[0]?.dom.parentNode;
	if (!parent) throw new Error('Cannot retain a mounted range before it has a physical parent');
	for (const mounted of mounts) {
		if (mounted.dom.parentNode !== parent)
			throw new Error('Cannot retain mounted siblings from different physical parents');
	}
	return parent;
}

function assertContiguousRange(nodes: readonly Node[], parent: Node): void {
	for (let index = 0; index < nodes.length; index++) {
		const node = nodes[index]!;
		if (node.parentNode !== parent)
			throw new Error('Cannot retain a mounted range whose nodes have different parents');
		if (index && nodes[index - 1]!.nextSibling !== node)
			throw new Error('Cannot retain a mounted range whose nodes are not contiguous');
	}
}

function collectPortalGroups(
	mounts: readonly Mounted[],
	groups: Array<{ mounts: readonly Mounted[]; parent: Node }>
): void {
	const pending = [...mounts];
	while (pending.length) {
		const mounted = pending.pop()!;
		if (mounted.portalTarget && mounted.children.length) {
			groups.push({ mounts: mounted.children, parent: mounted.portalTarget });
		}
		for (const child of mounted.children) pending.push(child);
	}
}
