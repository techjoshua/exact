import {
	consumeDomWork,
	createDomWorkBudget,
	findNodeOwnerInstance,
	walkDomSubtree,
	type DomWorkBudget
} from '@exactjs/dom/root';
import { type ExactRange, type ProtocolIndex } from './planning.js';

/** Creates a protocol index. */
export function createProtocolIndex(
	container: Element,
	work?: number | DomWorkBudget,
	executionRoot?: string
): ProtocolIndex | undefined {
	const budget = typeof work === 'number' || work === undefined ? createDomWorkBudget(work) : work;
	const index: ProtocolIndex = {
		ranges: new Map(),
		exactElements: new Map(),
		serverSlots: new Map(),
		clientBoundaries: new Map(),
		listItems: new Map(),
		budget
	};
	const attributes: Array<[string, Map<string, Element>]> = [
		['data-exact-id', index.exactElements],
		['data-exact-server-slot', index.serverSlots],
		['data-exact-client-boundary', index.clientBoundaries]
	];
	const stack: Array<{
		data: string;
		id: string;
		start: Comment;
		nearestBoundaryId?: string;
		listId?: string;
		itemKey?: string;
	}> = [];
	let valid = true;
	walkDomSubtree(
		container,
		(node) => {
			if (!valid) return;
			if (node instanceof Element) {
				if (!ownedByExecutionRoot(node, executionRoot)) return;
				for (const [attribute, output] of attributes) {
					const value = node.getAttribute(attribute);
					if (value === null) continue;
					if (output.has(value)) {
						valid = false;
						return;
					}
					output.set(value, node);
				}
				return;
			}
			if (!(node instanceof Comment)) return;
			const comment = node;
			const data = comment.data;
			if (data.startsWith('/exact:')) {
				const open = stack.pop();
				if (!open || data !== `/${open.data}`) {
					valid = false;
					return;
				}
				const range = { start: open.start, end: comment };
				if (!ownedByExecutionRoot(open.start, executionRoot)) return;
				if (open.itemKey !== undefined && open.listId) {
					let items = index.listItems.get(open.listId);
					if (!items) index.listItems.set(open.listId, (items = new Map()));
					if (items.has(open.itemKey)) {
						valid = false;
						return;
					}
					items.set(open.itemKey, range);
				} else {
					if (index.ranges.has(open.id)) {
						valid = false;
						return;
					}
					index.ranges.set(open.id, range);
				}
				return;
			}
			if (!data.startsWith('exact:')) return;
			const id = data.slice('exact:'.length);
			const itemKey = id.startsWith('item:') ? id.slice(id.lastIndexOf(':') + 1) : undefined;
			const parentBoundary = stack.at(-1)?.nearestBoundaryId;
			const listId = itemKey === undefined ? undefined : parentBoundary;
			const nearestBoundaryId = itemKey === undefined ? id : parentBoundary;
			stack.push({ data, id, start: comment, nearestBoundaryId, listId, itemKey });
		},
		{ budget }
	);
	return !valid || stack.length ? undefined : index;
}

function ownedByExecutionRoot(node: Node, executionRoot: string | undefined): boolean {
	if (!executionRoot) return true;
	const owner = findNodeOwnerInstance(node);
	return !owner || owner.domain.executionRoot === executionRoot;
}

/** Performs the reindex list domain operation. */
export function reindexList(index: ProtocolIndex, listId: string): void {
	const list = index.ranges.get(listId);
	if (!list) return;
	const items = new Map<string, ExactRange>();
	let cursor: Node | null = list.start.nextSibling;
	const starts = new Map<string, Comment>();
	while (cursor && cursor !== list.end) {
		consumeDomWork(index.budget);
		if (cursor instanceof Comment && cursor.data.startsWith('exact:item:')) {
			starts.set(cursor.data, cursor);
		} else if (cursor instanceof Comment && cursor.data.startsWith('/exact:item:')) {
			const data = cursor.data.slice(1);
			const start = starts.get(data);
			if (start) items.set(data.slice(data.lastIndexOf(':') + 1), { start, end: cursor });
		}
		cursor = cursor.nextSibling;
	}
	index.listItems.set(listId, items);
}
