import type { ReactMounted } from './types.js';

/** Moves a complete React-owned range before one physical sibling cursor. */
export function placeReactRange(parent: Node, mounted: ReactMounted, before: Node | null): void {
	if (before && before.parentNode !== parent)
		throw new Error(
			`React ${mounted.kind} range placement cursor does not belong to its parent (${before.nodeType}:${before.nodeValue ?? (before as Element).tagName ?? ''})`
		);
	const end = mounted.end ?? mounted.dom;
	let current: Node | null = mounted.dom;
	const nodes: Node[] = [];
	while (current) {
		nodes.push(current);
		if (current === end) break;
		current = current.nextSibling;
	}
	for (const node of nodes) parent.insertBefore(node, before);
}

/** Removes a complete React-owned physical range. */
export function removeReactRange(mounted: ReactMounted): void {
	if (mounted.kind === 'portal') {
		mounted.dom.parentNode?.removeChild(mounted.dom);
		return;
	}
	const end = mounted.end ?? mounted.dom;
	let current: Node | null = mounted.dom;
	while (current) {
		const next: Node | null = current.nextSibling;
		current.parentNode?.removeChild(current);
		if (current === end) break;
		current = next;
	}
}

/** Applies React Activity visibility to every host in an owned range. */
export function setReactRangeHidden(mounted: ReactMounted, hidden: boolean): void {
	const token = (mounted.activityToken ??= Symbol('react.activity'));
	for (const child of mounted.children) setMountedHidden(child, hidden, token);
}

function setMountedHidden(mounted: ReactMounted, hidden: boolean, token: symbol): void {
	mounted.instance?.setActivity(token, !hidden, 'react-activity');
	if (mounted.kind === 'host' && mounted.dom instanceof HTMLElement) mounted.dom.hidden = hidden;
	else for (const child of mounted.children) setMountedHidden(child, hidden, token);
}

/** Retargets component refresh cursors after a detached candidate range commits. */
export function retargetReactMountedParent(mounted: ReactMounted, parent: Node): void {
	if (mounted.renderContext) mounted.renderContext.parent = parent;
	if (mounted.kind === 'host') {
		for (const child of mounted.children) retargetReactMountedParent(child, mounted.dom);
		return;
	}
	for (const child of mounted.children) retargetReactMountedParent(child, parent);
}
