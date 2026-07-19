import type { ComponentInstance, VNode } from '@exact/core';
import { elementOwners, roots } from './state.js';
import type { Mounted } from './types.js';

export type DomInspectionNode = {
	readonly vnode: Readonly<Pick<VNode, 'type' | 'key'>>;
	readonly instance?: ComponentInstance<any>;
	readonly parent?: DomInspectionNode;
	readonly children: readonly DomInspectionNode[];
	elements(): readonly Element[];
	ownedElements(): readonly Element[];
};

/** Returns a read-only snapshot of the renderer-owned tree for tooling and tests. */
export function inspectDomRoot(container: Element): DomInspectionNode | undefined {
	const mounted = roots.get(container)?.mounted;
	return mounted ? inspectMounted(mounted, undefined) : undefined;
}

export function findElementOwner(element: Element): ComponentInstance<any> | undefined {
	return elementOwners.get(element);
}

function inspectMounted(
	mounted: Mounted,
	parent: DomInspectionNode | undefined
): DomInspectionNode {
	let children: readonly DomInspectionNode[] = [];
	const elements = Object.freeze(rootElements(mounted));
	const owned = Object.freeze(
		mounted.instance
			? allElements(mounted).filter((element) => elementOwners.get(element) === mounted.instance)
			: []
	);
	const node: DomInspectionNode = {
		vnode: Object.freeze({ type: mounted.vnode.type, key: mounted.vnode.key }),
		instance: mounted.instance,
		parent,
		get children() {
			return children;
		},
		elements: () => elements,
		ownedElements: () => owned
	};
	children = Object.freeze(mounted.children.map((child) => inspectMounted(child, node)));
	return Object.freeze(node);
}

function rootElements(mounted: Mounted): Element[] {
	if (isElementNode(mounted.dom)) return [mounted.dom];
	return mounted.children.flatMap(rootElements);
}

function allElements(mounted: Mounted): Element[] {
	const output = isElementNode(mounted.dom) ? [mounted.dom] : [];
	for (const child of mounted.children) output.push(...allElements(child));
	return output;
}

function isElementNode(node: Node): node is Element {
	return node.nodeType === 1;
}
