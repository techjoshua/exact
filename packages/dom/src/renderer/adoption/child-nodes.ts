/** Snapshots direct children without creating a live collection that subsequent adoption must update. */
export function snapshotChildNodes(parent: Node): Node[] {
	const children: Node[] = [];
	for (let child = parent.firstChild; child; child = child.nextSibling) children.push(child);
	return children;
}

/**
 * Snapshots one direct-child interval, retaining its closing anchor for empty-range adoption.
 * Returns undefined for detached, foreign, or reversed anchors. A null end means the parent's end.
 */
export function snapshotChildRange(
	parent: Node,
	first: Node | null,
	end: Node | null
): Node[] | undefined {
	if ((first && first.parentNode !== parent) || (end && end.parentNode !== parent))
		return undefined;
	const nodes: Node[] = [];
	for (let node = first; node; node = node.nextSibling) {
		nodes.push(node);
		if (node === end) return nodes;
	}
	return end ? undefined : nodes;
}
