import type { RenderProgramChildAnchor } from '../types.js';

/** Releases the renderer-owned adoption cursor after durable child-slot ownership is established. */
export function releaseProgramChildStart(anchor: RenderProgramChildAnchor | undefined): void {
	// Callers receive a readonly view. Only the renderer that allocated the tuple retires its cursor.
	if (anchor) (anchor as [Node, Node | null, (Node | null)?])[1] = null;
}

/** Finds a closing marker using the slot's already-normalized opaque identity. */
export function findProgramChildEnd(
	start: Node | undefined,
	id: string | undefined
): Comment | undefined {
	if (!(start instanceof Comment) || id === undefined) return undefined;
	const closing = `/x:${id}`;
	for (let node = start.nextSibling; node; node = node.nextSibling)
		if (node instanceof Comment && node.data === closing) return node;
	return undefined;
}
