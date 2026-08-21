/** Ephemeral identity index for one bounded variable-width program region. */
export type ProgramHydrationIndex = Readonly<{
	elements: ReadonlyMap<string, Element>;
	markers: ReadonlyMap<string, Comment>;
}>;

/** Indexes compiler identities in one traversal; callers release the map after adoption. */
export function indexProgramHydration(root: Element): ProgramHydrationIndex {
	const elements = new Map<string, Element>();
	const markers = new Map<string, Comment>();
	const pending = [root as Node];
	while (pending.length) {
		const node = pending.pop()!;
		if (node instanceof Element) {
			const id = node.getAttribute('data-exact-id');
			if (id) elements.set(id, node);
		} else if (node instanceof Comment && node.data.startsWith('exact:dynamic:')) {
			markers.set(node.data, node);
		}
		for (let index = node.childNodes.length - 1; index >= 0; index--)
			pending.push(node.childNodes[index]!);
	}
	return { elements, markers };
}

/** Claims one compiler-identified structural child marker. */
export function claimProgramChildSlot(
	index: ProgramHydrationIndex,
	id: string
): Comment | undefined {
	const identity = markerIdentity(id);
	const marker = index.markers.get(`exact:dynamic:${identity}`);
	return marker instanceof Comment && marker.data === `exact:dynamic:${identity}`
		? marker
		: undefined;
}

/** Claims one compiler-identified SSR scalar range and materializes its empty text node. */
export function claimProgramTextSlot(
	root: Element,
	index: ProgramHydrationIndex,
	id: string
): Text | undefined {
	const identity = markerIdentity(id);
	const marker = index.markers.get(`exact:dynamic:${identity}`);
	if (!(marker instanceof Comment) || marker.data !== `exact:dynamic:${identity}`) return undefined;
	let text = marker.nextSibling instanceof Text ? marker.nextSibling : undefined;
	const closing = text ? text.nextSibling : marker.nextSibling;
	if (!(closing instanceof Comment) || closing.data !== `/exact:dynamic:${identity}`)
		return undefined;
	if (!text) {
		text = root.ownerDocument.createTextNode('');
		closing.parentNode?.insertBefore(text, closing);
	}
	return text;
}

/** Compares two compiler paths without allocating a string key. */
export function sameProgramPath(left: readonly number[], right: readonly number[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
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
