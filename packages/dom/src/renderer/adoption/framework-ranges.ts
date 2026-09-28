import { snapshotChildNodes } from './child-nodes.js';

/** Bounds framework-owned content that must be excluded from authored child adoption. */
export type FrameworkChildRange = { start: Comment; end: Comment };

/**
 * Finds the first framework range and snapshots authored siblings in one pass.
 * Only adjacent framework marker pairs hide content. An unmatched first opening preserves all
 * children, including later pairs, matching the adoption fallback for incomplete documents.
 */
export function collectAuthoredChildren(parent: Element): {
	framework: FrameworkChildRange | undefined;
	nodes: Node[];
} {
	const nodes: Node[] = [];
	let first: Comment | undefined;
	let expectedFirst: string | undefined;
	let framework: FrameworkChildRange | undefined;
	let pendingEnd: string | undefined;
	let pendingIndex = 0;
	for (let node = parent.firstChild; node; node = node.nextSibling) {
		nodes.push(node);
		if (!(node instanceof Comment)) continue;
		const value = node.data;
		if (first && !framework && value === expectedFirst) framework = { start: first, end: node };
		if (!/^exact:framework-(head|body):/.test(value)) continue;
		if (value === pendingEnd) nodes.length = pendingIndex;
		pendingEnd = undefined;
		if (/^exact:framework-(head|body):start$/.test(value)) {
			pendingEnd = value.replace(/:start$/, ':end');
			pendingIndex = nodes.length - 1;
			if (!first) {
				first = node;
				expectedFirst = pendingEnd;
			}
		}
	}
	return { framework, nodes: first && !framework ? snapshotChildNodes(parent) : nodes };
}
