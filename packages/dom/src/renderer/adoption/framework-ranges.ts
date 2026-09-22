import { snapshotChildNodes } from './child-nodes.js';

/** Bounds framework-owned content that must be excluded from authored child adoption. */
export type FrameworkChildRange = { start: Comment; end: Comment };

/** Finds an ordered pair of direct-child framework markers; incomplete ranges are not adopted. */
export function frameworkChildRange(parent: Element): FrameworkChildRange | undefined {
	const children = snapshotChildNodes(parent);
	const startIndex = children.findIndex(
		(node) => node instanceof Comment && /^exact:framework-(head|body):start$/.test(node.data)
	);
	if (startIndex < 0) return undefined;
	const endIndex = children.findIndex(
		(node, index) =>
			index > startIndex &&
			node instanceof Comment &&
			node.data === (children[startIndex] as Comment).data.replace(/:start$/, ':end')
	);
	if (endIndex < 0) return undefined;
	return {
		start: children[startIndex] as Comment,
		end: children[endIndex] as Comment
	};
}

/** Selects authored siblings outside the framework range, excluding both of its markers. */
export function authoredChildNodes(
	parent: Element,
	framework: FrameworkChildRange | undefined
): Node[] {
	if (!framework) return snapshotChildNodes(parent);
	const nodes: Node[] = [];
	const children = snapshotChildNodes(parent);
	for (let index = 0; index < children.length; index++) {
		const node = children[index]!;
		if (node instanceof Comment && /^exact:framework-(head|body):start$/.test(node.data)) {
			const expected = node.data.replace(/:start$/, ':end');
			let closing = index + 1;
			while (closing < children.length) {
				const candidate = children[closing]!;
				if (candidate instanceof Comment && /^exact:framework-(head|body):/.test(candidate.data))
					break;
				closing++;
			}
			const candidate = children[closing];
			if (candidate instanceof Comment && candidate.data === expected) {
				index = closing;
				continue;
			}
		}
		nodes.push(node);
	}
	return nodes;
}
