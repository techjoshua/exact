import { decodeExactMarkerPart } from '@exactjs/core';

/** Locates one complete component marker pair by its selected artifact identity. */
export function componentMarkerBoundaryByIdentity(
	nodes: readonly Node[],
	cursor: number,
	identity: string,
	end = nodes.length
): { start: Comment; endIndex: number; matches: boolean } | undefined {
	const start = nodes[cursor];
	if (!(start instanceof Comment) || !start.data.startsWith('exact:component:')) return undefined;
	let endIndex = -1;
	for (let index = cursor + 1; index < end; index++) {
		const node = nodes[index];
		if (node instanceof Comment && node.data === `/${start.data}`) {
			endIndex = index;
			break;
		}
	}
	if (endIndex < 0) return undefined;
	const parts = start.data.split(':');
	return {
		start,
		endIndex,
		matches: parts.length >= 4 && decodeExactMarkerPart(parts[3]!) === identity
	};
}
