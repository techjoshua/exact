import type { DomInspectionNode } from '@exactjs/dom/testing';

/** Collects component-bearing nodes in depth-first order with one visit and no subtree copies. */
export function componentNodes(root: DomInspectionNode): DomInspectionNode[] {
	const output: DomInspectionNode[] = [];
	const pending = [root];
	while (pending.length) {
		const node = pending.pop()!;
		if (node.instance) output.push(node);
		for (let index = node.children.length - 1; index >= 0; index--)
			pending.push(node.children[index]!);
	}
	return output;
}
