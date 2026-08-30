/** Ephemeral identity index for one bounded variable-width program region. */
export type ProgramHydrationIndex = Readonly<{
	/** Dense compiler indexes resolve without allocating string keys or map entries. */
	elements: readonly Element[];
	/** Structural marker lookup is allocation-on-demand for programs which contain ranges. */
	markers?: ReadonlyMap<string, Comment>;
}>;

/** Indexes compiler identities in one traversal; callers release the ephemeral index after use. */
export function indexProgramHydration(root: Element): ProgramHydrationIndex {
	const elements: Element[] = [];
	let markers: Map<string, Comment> | undefined;
	let node: Node | undefined = root;
	while (node) {
		let current: Node = node;
		if (current instanceof Element) {
			elements.push(current);
		} else if (current instanceof Comment && current.data.startsWith('x:')) {
			(markers ??= new Map()).set(current.data, current);
			const boundary = findLegacyDynamicClosingMarker(current);
			if (boundary) current = boundary;
		}
		if (current.firstChild) {
			node = current.firstChild;
			continue;
		}
		node = current;
		while (node && node !== root && !node.nextSibling) node = node.parentNode ?? undefined;
		if (node === root) break;
		node = node?.nextSibling ?? undefined;
	}
	return {
		elements,
		...(markers ? { markers } : {})
	};
}

/** Resolves one dense compiler-owned node index. */
export function programElement(index: ProgramHydrationIndex, id: number): Element | undefined {
	return index.elements[id];
}

/** Claims one compiler-identified structural child marker. */
export function claimProgramChildSlot(
	index: ProgramHydrationIndex,
	id: string
): Comment | undefined {
	const identity = markerIdentity(id);
	const marker = index.markers?.get(`x:${identity}`);
	return marker instanceof Comment && marker.data === `x:${identity}` ? marker : undefined;
}

/** Claims one compiler-identified SSR scalar range and materializes its empty text node. */
export function claimProgramTextSlot(
	root: Element,
	index: ProgramHydrationIndex,
	id: string
): Text | undefined {
	const identity = markerIdentity(id);
	const marker = index.markers?.get(`x:${identity}`);
	if (!(marker instanceof Comment) || marker.data !== `x:${identity}`) return undefined;
	let text = marker.nextSibling instanceof Text ? marker.nextSibling : undefined;
	const closing = text ? text.nextSibling : marker.nextSibling;
	if (!(closing instanceof Comment) || closing.data !== `/x:${identity}`) return undefined;
	if (!text) {
		text = root.ownerDocument.createTextNode('');
		closing.parentNode?.insertBefore(text, closing);
	}
	// The compiled binding retains the text node itself. Scalar sentinels have no range ownership
	// after a successful claim, unlike structural child markers, so keeping them would permanently
	// double the DOM-node overhead of every reactive text expression.
	marker.remove();
	closing.remove();
	return text;
}

/** Resolves the sole retained path form: a scalar node in markerless template topology. */
export function programNodeAtPath(root: Node, path: readonly number[]): Node | undefined {
	let node: Node | undefined = root;
	for (const index of path) {
		node = node?.firstChild ?? undefined;
		for (let offset = 0; node && offset < index; offset++) node = node.nextSibling ?? undefined;
	}
	return node;
}

/** Resolves the optional outer cell range enclosing a marked render program. */
export function markedProgramRange(
	nodes: readonly Node[],
	cursor: number,
	end: number
): { start?: Comment; contentStart: number; endIndex: number } | undefined {
	const start = nodes[cursor];
	if (!(start instanceof Comment) || !start.data.startsWith('exact:cell:'))
		return { contentStart: cursor, endIndex: cursor + 1 };
	for (let index = cursor + 1; index < end; index++) {
		const candidate = nodes[index];
		if (candidate instanceof Comment && candidate.data === `/${start.data}`)
			return { start, contentStart: cursor + 1, endIndex: index };
	}
	return undefined;
}

function markerIdentity(id: string): string {
	return id.startsWith('exact:') ? id.slice('exact:'.length) : id;
}

function findLegacyDynamicClosingMarker(start: Comment): Comment | undefined {
	const closing = `/${start.data}`;
	for (let node = start.nextSibling; node; node = node.nextSibling)
		if (node instanceof Comment && node.data === closing) return node;
	return undefined;
}
