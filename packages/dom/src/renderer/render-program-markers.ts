/** Finds the closing marker for one compiler-owned structural child slot. */
export function findProgramChildEnd(
	start: Node | undefined,
	id: string | undefined
): Comment | undefined {
	if (!(start instanceof Comment) || !id) return undefined;
	const identity = id.startsWith('exact:') ? id.slice('exact:'.length) : id;
	const closing = `/x:${identity}`;
	for (let node = start.nextSibling; node; node = node.nextSibling)
		if (node instanceof Comment && node.data === closing) return node;
	return undefined;
}
