import { type Child, type ComponentInstance, type VNode } from '@exact/core';
import { type EffectScope } from '@exact/reactive';
import { childToVNode } from '../../children.js';
import type { Mounted, Root } from '../../types.js';
import { unmountMany } from '../teardown.js';
import { adoptStaticMounted } from './tree.js';

/** Performs the boundary markers domain operation. */
export function boundaryMarkers(container: Element): { start: Comment; end: Comment } | undefined {
	const comments = Array.from(container.childNodes).filter(
		(node): node is Comment => node.nodeType === Node.COMMENT_NODE
	);
	const start = comments.find((node) => node.data.startsWith('exact:'));
	if (!start) return undefined;
	const end = comments.find((node) => node.data === `/${start.data}`);
	return end ? { start, end } : undefined;
}

/** Performs the content nodes between domain operation. */
export function contentNodesBetween(start: Node, end: Node): Node[] {
	const nodes: Node[] = [];
	for (let current = start.nextSibling; current && current !== end; current = current.nextSibling)
		nodes.push(current);
	return nodes;
}

/** Creates a range anchor. */
export function createRangeAnchor(parent: Node): Node {
	return parent.nodeType === Node.DOCUMENT_NODE
		? document.createComment('exact:component-range')
		: document.createTextNode('');
}

/** Defines the framework child range type contract. */
export type FrameworkChildRange = { start: Comment; end: Comment };

/** Performs the framework child range domain operation. */
export function frameworkChildRange(parent: Element): FrameworkChildRange | undefined {
	const children = Array.from(parent.childNodes);
	const startIndex = children.findIndex(
		(node) => node instanceof Comment && node.data === 'exact:framework-body:start'
	);
	if (startIndex < 0) return undefined;
	const endIndex = children.findIndex(
		(node, index) =>
			index > startIndex && node instanceof Comment && node.data === 'exact:framework-body:end'
	);
	if (endIndex < 0) return undefined;
	return {
		start: children[startIndex] as Comment,
		end: children[endIndex] as Comment
	};
}

/** Performs the authored child nodes domain operation. */
export function authoredChildNodes(
	parent: Element,
	framework: FrameworkChildRange | undefined
): Node[] {
	if (!framework) return Array.from(parent.childNodes);
	const nodes: Node[] = [];
	let frameworkOwned = false;
	for (const node of Array.from(parent.childNodes)) {
		if (node === framework.start) {
			frameworkOwned = true;
			continue;
		}
		if (node === framework.end) {
			frameworkOwned = false;
			continue;
		}
		if (!frameworkOwned) nodes.push(node);
	}
	return nodes;
}

/** Performs the adopt static children domain operation. */
export function adoptStaticChildren(
	root: Root,
	children: Child[],
	nodes: readonly Node[],
	parentInstance: ComponentInstance<any>,
	parentScope: EffectScope
): Mounted[] | undefined {
	return adoptStaticChildrenRange(root, children, nodes, parentInstance, parentScope, true)?.mounts;
}

/** Performs the adopt static children range domain operation. */
export function adoptStaticChildrenRange(
	root: Root,
	children: Child[],
	nodes: readonly Node[],
	parentInstance: ComponentInstance<any>,
	parentScope: EffectScope,
	requireAll: boolean
): { mounts: Mounted[]; next: number } | undefined {
	const vnodes = children.map(childToVNode).filter((child): child is VNode => !!child);
	const mounts: Mounted[] = [];
	let cursor = 0;
	for (const child of vnodes) {
		const result = adoptStaticMounted(root, child, nodes, cursor, parentInstance, parentScope);
		if (!result) {
			unmountMany(mounts);
			return undefined;
		}
		mounts.push(result.mounted);
		cursor = result.next;
	}
	if (requireAll && cursor !== nodes.length) {
		unmountMany(mounts);
		return undefined;
	}
	return { mounts, next: cursor };
}
