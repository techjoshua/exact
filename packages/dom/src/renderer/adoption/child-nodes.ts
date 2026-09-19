/** Snapshots direct children without creating a live collection that subsequent adoption must update. */
export function snapshotChildNodes(parent: Node): Node[] {
	const children: Node[] = [];
	for (let child = parent.firstChild; child; child = child.nextSibling) children.push(child);
	return children;
}
