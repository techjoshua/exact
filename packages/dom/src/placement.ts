import { describeNode, domDebug } from './debug.js';
import { foreignChildCapability } from './renderer/foreign-child-capability.js';
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
		runAfterPlacement(root, mounted);
		return;
	}

	for (const node of nodes) {
		insertBeforeIfNeeded(root, parent, node, cursor);
	}
	runAfterPlacement(root, mounted);
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
		if (aliasesKeyedChildRange(current.mounted)) {
			pending.push({ mounted: current.mounted.children[0]!, end: false });
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
		!!mounted.end ||
		mounted.childRangeReceipt !== undefined ||
		mounted.range === 'item' ||
		mounted.range === 'root' ||
		mounted.fragmentReceipt !== undefined ||
		mounted.targetReceipt !== undefined ||
		mounted.clientArtifact !== undefined ||
		foreignChildCapability()?.ownsChildDom?.(mounted) === true
	);
}

/** A client-created keyed owner reuses its only child's physical range without extra markers. */
function aliasesKeyedChildRange(mounted: Mounted): boolean {
	const child =
		mounted.range === 'item' && mounted.children.length === 1 ? mounted.children[0] : undefined;
	return !!child && mounted.dom === child.dom && mounted.end === child.end;
}

function runAfterPlacement(root: Root, mounted: Mounted): void {
	const pending: Array<Readonly<{ mounted: Mounted; mountCommit?: boolean }>> = [{ mounted }];
	while (pending.length) {
		const entry = pending.pop()!;
		const current = entry.mounted;
		if (entry.mountCommit) {
			const callback = current.afterPlacement;
			if (
				callback &&
				current.afterPlacementPhase === 'mount' &&
				isInFinalPlacement(root, current.dom)
			) {
				current.afterPlacement = undefined;
				current.afterPlacementPhase = undefined;
				callback();
			}
			continue;
		}
		if (current.afterPlacementPhase === 'mount')
			pending.push({ mounted: current, mountCommit: true });
		for (let index = current.children.length - 1; index >= 0; index--)
			pending.push({ mounted: current.children[index]! });
		const callback = current.afterPlacement;
		const phase = current.afterPlacementPhase;
		if (!callback || phase === 'mount') continue;
		current.afterPlacement = undefined;
		current.afterPlacementPhase = undefined;
		if (phase === 'retention') (root.placementRetentions ??= new Map()).set(current, callback);
		else callback();
	}
}

/** Reports whether a provisional subtree has reached its root or a connected portal target. */
function isInFinalPlacement(root: Root, node: Node): boolean {
	if (root.container.contains(node)) return true;
	if (node.isConnected) return true;
	for (const target of root.portalTargets) if (target.contains(node)) return true;
	return false;
}

/** Commits range retention after every ordinary placement callback in the transaction. */
export function flushPlacementRetentions(root: Root): void {
	while (root.placementRetentions?.size) {
		const callbacks = [...root.placementRetentions.values()];
		root.placementRetentions.clear();
		for (const callback of callbacks) callback();
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
