/** Finds one compiler-identified intrinsic inside a bounded render-program region. */
export function findProgramElement(root: Element, id: string): Element | undefined {
	if (root.getAttribute('data-exact-id') === id) return root;
	const pending = [...root.children];
	while (pending.length) {
		const element = pending.shift()!;
		if (element.getAttribute('data-exact-id') === id) return element;
		pending.push(...element.children);
	}
	return undefined;
}

/** Claims one compiler-identified structural child marker. */
export function claimProgramChildSlot(root: Element, id: string): Comment | undefined {
	const identity = markerIdentity(id);
	const marker = findProgramMarker(root, `exact:dynamic:${identity}`);
	return marker instanceof Comment && marker.data === `exact:dynamic:${identity}`
		? marker
		: undefined;
}

/** Claims one compiler-identified SSR scalar range and materializes its empty text node. */
export function claimProgramTextSlot(root: Element, id: string): Text | undefined {
	const identity = markerIdentity(id);
	const marker = findProgramMarker(root, `exact:dynamic:${identity}`);
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

function findProgramMarker(root: Element, data: string): Comment | undefined {
	const pending = [...root.childNodes];
	while (pending.length) {
		const node = pending.shift()!;
		if (node instanceof Comment && node.data === data) return node;
		pending.push(...node.childNodes);
	}
	return undefined;
}

function markerIdentity(id: string): string {
	return id.startsWith('exact:') ? id.slice('exact:'.length) : id;
}
