import { Cell, Dynamic, Fragment, Target, UnsafeHtml } from '@exactjs/core';
import { describeNode, domDebug } from './debug.js';
import type { Mounted, Root } from './types.js';

/** Places the full DOM range for a mounted subtree before the requested cursor. */
export function placeMountedBefore(
	root: Root,
	parent: Node,
	mounted: Mounted,
	before?: Node | null
): void {
	const cursor = before?.parentNode === parent ? before : null;
	const nodes = mountedDomNodes(mounted);
	const first = nodes[0];
	const last = nodes[nodes.length - 1];

	if (first.parentNode === parent && last.nextSibling === cursor && areContiguous(nodes)) {
		domDebug(root, 'skip placement', () => ({
			reason: 'mounted-range-already-before-cursor',
			parent: describeNode(parent),
			node: describeNode(first),
			before: describeNode(cursor)
		}));
		runAfterPlacement(mounted);
		return;
	}

	for (const node of nodes) {
		insertBeforeIfNeeded(root, parent, node, cursor);
	}
	runAfterPlacement(mounted);
}

/** Returns every DOM node owned by a mounted subtree in document order. */
export function mountedDomNodes(mounted: Mounted): Node[] {
	const nodes: Node[] = [];
	const pending: Array<{ mounted: Mounted; end: boolean }> = [{ mounted, end: false }];
	while (pending.length) {
		const current = pending.pop()!;
		if (current.end) {
			if (current.mounted.end) nodes.push(current.mounted.end);
			continue;
		}
		nodes.push(current.mounted.dom);
		if (current.mounted.end) pending.push({ mounted: current.mounted, end: true });
		if (current.mounted.rawNodes) nodes.push(...current.mounted.rawNodes);
		if (ownsChildDom(current.mounted)) {
			for (let index = current.mounted.children.length - 1; index >= 0; index--) {
				pending.push({ mounted: current.mounted.children[index]!, end: false });
			}
		}
	}
	return nodes;
}

/** Returns the DOM node immediately after the last mounted child, if one exists. */
export function afterMountedChildren(mounted: Mounted): Node | null {
	if (mounted.end) return mounted.end.nextSibling;
	const lastChild = mounted.children[mounted.children.length - 1];
	return lastChild ? lastMountedNode(lastChild).nextSibling : mounted.dom.nextSibling;
}

/** Returns the final DOM node owned by a mounted subtree. */
export function lastMountedNode(mounted: Mounted): Node {
	let current = mounted;
	while (!current.end && ownsChildDom(current) && current.children.length)
		current = current.children[current.children.length - 1]!;
	return current.end ?? current.dom;
}

function ownsChildDom(mounted: Mounted): boolean {
	return (
		!mounted.directDom &&
		(!!mounted.end ||
			mounted.vnode.type === Cell ||
			mounted.vnode.type === Fragment ||
			mounted.vnode.type === Target ||
			mounted.vnode.type === Dynamic ||
			mounted.vnode.type === UnsafeHtml ||
			typeof mounted.vnode.type === 'function')
	);
}

function runAfterPlacement(mounted: Mounted): void {
	const pending = [mounted];
	while (pending.length) {
		const current = pending.pop()!;
		for (let index = current.children.length - 1; index >= 0; index--)
			pending.push(current.children[index]!);
		const callback = current.afterPlacement;
		current.afterPlacement = undefined;
		callback?.();
	}
}

function areContiguous(nodes: Node[]): boolean {
	for (let index = 0; index < nodes.length - 1; index++) {
		if (nodes[index]!.nextSibling !== nodes[index + 1]) return false;
	}
	return true;
}

function insertBeforeIfNeeded(root: Root, parent: Node, node: Node, before?: Node | null): void {
	const cursor = before?.parentNode === parent ? before : null;
	if (node === cursor) {
		domDebug(root, 'skip placement', () => ({
			reason: 'node-is-cursor',
			parent: describeNode(parent),
			node: describeNode(node),
			before: describeNode(cursor)
		}));
		return;
	}
	if (node.parentNode === parent && node.nextSibling === cursor) {
		domDebug(root, 'skip placement', () => ({
			reason: 'already-before-cursor',
			parent: describeNode(parent),
			node: describeNode(node),
			before: describeNode(cursor)
		}));
		return;
	}
	domDebug(root, 'place node', () => ({
		parent: describeNode(parent),
		node: describeNode(node),
		before: describeNode(cursor),
		active: describeNode(document.activeElement)
	}));
	parent.insertBefore(node, cursor);
}
