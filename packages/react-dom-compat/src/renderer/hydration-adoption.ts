import type { ReactNode } from '@exactjs/react-compat';
import type { ReactMounted, ReactRendererRoot } from './types.js';
import {
	applyReactHostProps,
	finalizeReactHostProps,
	releaseReactHostProps
} from './host-properties.js';
import { disposeReactMounted, reconcileReactChildren } from './tree.js';

type Cursor = { parent: Node; next: Node | null };

/** Adopts matching server markup into a freshly constructed React ownership tree. */
export function adoptReactRootMarkup(root: ReactRendererRoot, value: ReactNode): boolean {
	const fragment = (root.container.ownerDocument ?? document).createDocumentFragment();
	let mounted: ReactMounted[] = [];
	try {
		mounted = reconcileReactChildren({ root, parent: fragment }, [], value);
		const cursor: Cursor = {
			parent: root.container,
			next: firstHydratable(root.hydrationStart ?? root.container.firstChild, root.hydrationEnd)
		};
		for (const child of mounted) adoptMounted(child, cursor);
		if (firstHydratable(cursor.next, root.hydrationEnd) !== null)
			throw new Error('Unclaimed server markup remains');
		root.mounted = mounted;
		return true;
	} catch {
		for (const child of mounted) disposeReactMounted(child);
		return false;
	}
}

function adoptMounted(mounted: ReactMounted, cursor: Cursor): void {
	if (mounted.kind === 'text') {
		const node = firstHydratable(cursor.next);
		if (!(node instanceof Text) || node.data !== mounted.dom.nodeValue)
			throw new Error('Server text does not match');
		mounted.dom = node;
		cursor.next = firstHydratable(node.nextSibling);
		return;
	}
	if (mounted.kind === 'host') {
		adoptHost(mounted, cursor);
		return;
	}
	if (mounted.kind === 'portal') return;
	adoptTransparentRange(mounted, cursor);
}

function adoptHost(mounted: ReactMounted, cursor: Cursor): void {
	const node = firstHydratable(cursor.next);
	if (!(node instanceof Element) || node.localName !== mounted.type)
		throw new Error('Server element does not match');
	const generated = mounted.dom as Element;
	const props = mounted.props ?? {};
	releaseReactHostProps(generated, props);
	applyReactHostProps(node, {}, props);
	const childCursor: Cursor = { parent: node, next: firstHydratable(node.firstChild) };
	for (const child of mounted.children) adoptMounted(child, childCursor);
	if (firstHydratable(childCursor.next) !== null)
		throw new Error('Unclaimed server children remain');
	mounted.dom = node;
	retargetComponentContexts(mounted.children, node);
	finalizeReactHostProps(node, props);
	cursor.next = firstHydratable(node.nextSibling);
}

function adoptTransparentRange(mounted: ReactMounted, cursor: Cursor): void {
	const generatedStart = mounted.dom;
	const generatedEnd = mounted.end;
	const first = firstHydratable(cursor.next);
	const start = cursor.parent.ownerDocument!.createTextNode('');
	if (first && first.parentNode !== cursor.parent)
		throw new Error('React hydration start cursor does not belong to its parent');
	cursor.parent.insertBefore(start, first);
	mounted.dom = start;
	for (const child of mounted.children) adoptMounted(child, cursor);
	const end = cursor.parent.ownerDocument!.createTextNode('');
	if (cursor.next && cursor.next.parentNode !== cursor.parent)
		throw new Error('React hydration end cursor does not belong to its parent');
	cursor.parent.insertBefore(end, cursor.next);
	mounted.end = end;
	if (mounted.renderContext) mounted.renderContext.parent = cursor.parent;
	generatedStart.parentNode?.removeChild(generatedStart);
	generatedEnd?.parentNode?.removeChild(generatedEnd);
}

function retargetComponentContexts(children: readonly ReactMounted[], parent: Node): void {
	for (const child of children) {
		if (child.renderContext) child.renderContext.parent = parent;
		if (child.kind === 'host') retargetComponentContexts(child.children, child.dom);
		else retargetComponentContexts(child.children, parent);
	}
}

function firstHydratable(node: Node | null, boundary?: Node | null): Node | null {
	let current = node;
	while (current instanceof Comment && current !== boundary) current = current.nextSibling;
	if (current === boundary) return null;
	return current;
}
