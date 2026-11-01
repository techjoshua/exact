import { retargetReactMountedParent } from './range.js';
import type { ReactNode } from '@exactjs/react-compat';
import type { ReactMounted, ReactRendererRoot } from './types.js';
import {
	applyReactHostProps,
	finalizeReactHostProps,
	releaseReactHostProps
} from './host-properties.js';
import { reconcileReactChildren } from './tree.js';
import { disposeReactMounts } from './teardown.js';

type Cursor = { parent: Node; next: Node | null; boundary?: Node | null };

/** Adopts matching server markup into a freshly constructed React ownership tree. */
export function adoptReactRootMarkup(root: ReactRendererRoot, value: ReactNode): boolean {
	const fragment = (root.container.ownerDocument ?? document).createDocumentFragment();
	let mounted: ReactMounted[] = [];
	try {
		mounted = reconcileReactChildren({ root, parent: fragment, owner: root.owner }, [], value);
		const cursor: Cursor = {
			parent: root.container,
			next: root.hydrationStart ?? root.container.firstChild,
			boundary: root.hydrationEnd
		};
		for (const child of mounted) adoptMounted(child, cursor);
		if (firstHydratable(cursor) !== null) throw new Error('Unclaimed server markup remains');
		root.mounted = mounted;
		return true;
	} catch {
		disposeReactMounts(mounted);
		return false;
	}
}

function adoptMounted(mounted: ReactMounted, cursor: Cursor): void {
	if (mounted.kind === 'text') {
		const node = firstHydratable(cursor);
		if (!(node instanceof Text) || node.data !== mounted.dom.nodeValue)
			throw new Error('Server text does not match');
		mounted.dom = node;
		cursor.next = node.nextSibling;
		return;
	}
	if (mounted.kind === 'host') {
		adoptHost(mounted, cursor);
		return;
	}
	if (mounted.kind === 'portal') {
		cursor.parent.insertBefore(mounted.dom, firstHydratable(cursor) ?? cursor.boundary ?? null);
		return;
	}
	adoptTransparentRange(mounted, cursor);
}

function adoptHost(mounted: ReactMounted, cursor: Cursor): void {
	const node = firstHydratable(cursor);
	if (!(node instanceof Element) || node.localName !== mounted.type)
		throw new Error('Server element does not match');
	const generated = mounted.dom as Element;
	const props = mounted.props ?? {};
	if (mounted.rawHtml && node.innerHTML !== generated.innerHTML)
		throw new Error('Server raw HTML does not match');
	releaseReactHostProps(generated);
	const context = { ...mounted.renderContext!, parent: cursor.parent };
	mounted.renderContext = context;
	applyReactHostProps(node, {}, props, context);
	if (!mounted.rawHtml) {
		const childCursor: Cursor = { parent: node, next: node.firstChild };
		for (const child of mounted.children) adoptMounted(child, childCursor);
		if (firstHydratable(childCursor) !== null) throw new Error('Unclaimed server children remain');
	}

	mounted.dom = node;
	for (const child of mounted.children) retargetReactMountedParent(child, node);
	finalizeReactHostProps(node, props);
	cursor.next = node.nextSibling;
}

function adoptTransparentRange(mounted: ReactMounted, cursor: Cursor): void {
	const generatedStart = mounted.dom;
	const generatedEnd = mounted.end;
	const first = firstHydratable(cursor);
	const start = cursor.parent.ownerDocument!.createTextNode('');
	if (first && first.parentNode !== cursor.parent)
		throw new Error('React hydration start cursor does not belong to its parent');
	cursor.parent.insertBefore(start, first ?? cursor.boundary ?? null);
	mounted.dom = start;
	for (const child of mounted.children) adoptMounted(child, cursor);
	const end = cursor.parent.ownerDocument!.createTextNode('');
	if (cursor.next && cursor.next.parentNode !== cursor.parent)
		throw new Error('React hydration end cursor does not belong to its parent');
	cursor.parent.insertBefore(end, firstHydratable(cursor) ?? cursor.boundary ?? null);
	mounted.end = end;
	if (mounted.renderContext) mounted.renderContext.parent = cursor.parent;
	generatedStart.parentNode?.removeChild(generatedStart);
	generatedEnd?.parentNode?.removeChild(generatedEnd);
}

/** Skips only within this owned range, retiring SSR text separators while retaining its native end anchor. */
function firstHydratable(cursor: Cursor): Node | null {
	while (cursor.next?.nodeType === 8 && cursor.next !== cursor.boundary) {
		const comment = cursor.next;
		cursor.next = comment.nextSibling;
		if (comment.nodeValue === ' ') comment.parentNode?.removeChild(comment);
	}
	return cursor.next === cursor.boundary ? null : cursor.next;
}
